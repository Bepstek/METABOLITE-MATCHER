import "./load-env";
import path from "node:path";
import { db } from "../src/db/kysely";
import { clearBatch, getImportBatchSize, readJsonlGz } from "../src/services/import-utils";

type SpectraImportMode = "predicted" | "experimental";

interface SpectrumPeakJsonRow {
  peak_id?: number | string | null;
  msms_id?: number | string | null;
  mass_charge: number | string;
  raw_intensity?: number | string | null;
  normalized_intensity?: number | string | null;
}

interface SpectrumJsonRow {
  spectrum_id?: number | string | null;
  compound_accession?: string | null;
  predicted?: boolean;
  ionization_mode?: string | null;
  polarity?: "positive" | "negative" | string | null;
  instrument_type?: string | null;
  collision_energy_voltage?: number | string | null;
  splash_key?: string | null;
  peak_counter?: number | string | null;
  raw_metadata?: unknown;
  peaks?: SpectrumPeakJsonRow[] | null;
}

interface NormalizedSpectrumRow {
  import_batch_id: number;
  compound_id: number;
  hmdb_spectrum_id: number;
  predicted: boolean;
  ionization_mode: string | null;
  polarity: "positive" | "negative" | null;
  instrument_type: string | null;
  collision_energy_voltage: number | null;
  splash_key: string | null;
  peak_counter: number | null;
  raw_metadata: string | null;
}

interface PeakInsertRow {
  spectrum_id: number;
  hmdb_peak_id: number | null;
  hmdb_msms_id: number | null;
  mass_charge: number;
  raw_intensity: number | null;
  normalized_intensity: number | null;
}

function getMode(): SpectraImportMode {
  const mode = process.argv[2];

  if (mode !== "predicted" && mode !== "experimental") {
    throw new Error("Usage: tsx scripts/import-spectra.ts predicted|experimental");
  }

  return mode;
}

function getSpectraFilePath(mode: SpectraImportMode): string {
  const envKey = mode === "predicted" ? "PREDICTED_SPECTRA_JSONL_GZ" : "EXPERIMENTAL_SPECTRA_JSONL_GZ";

  const fallback =
    mode === "predicted"
      ? "datasets/parsed/hmdb_predicted_msms_spectra.jsonl.gz"
      : "datasets/parsed/hmdb_experimental_msms_spectra.jsonl.gz";

  return path.resolve(process.env[envKey] ?? fallback);
}

function getImportMaxRows(): number | null {
  const rawValue = process.env.SPECTRA_IMPORT_MAX_ROWS;

  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function toRequiredInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function toRequiredNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAccession(accession: unknown): string | null {
  if (typeof accession !== "string") {
    return null;
  }

  const normalized = accession.trim().toUpperCase();

  return normalized.length > 0 ? normalized : null;
}

function normalizePolarity(polarity: SpectrumJsonRow["polarity"]): "positive" | "negative" | null {
  if (!polarity) {
    return null;
  }

  const normalized = String(polarity).trim().toLowerCase();

  if (normalized === "positive" || normalized === "negative") {
    return normalized;
  }

  return null;
}

function toJsonbString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function chunkRows<T>(rows: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}

async function createImportBatch(mode: SpectraImportMode, sourceFilename: string): Promise<number> {
  const row = await db
    .insertInto("import_batches")
    .values({
      dataset_name: mode === "predicted" ? "predicted_msms_spectra" : "experimental_msms_spectra",
      source_filename: sourceFilename,
      status: "running",
      notes: `Import from parsed HMDB ${mode} MS/MS JSONL.GZ`,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  return row.id;
}

async function updateImportBatchStatus(
  importBatchId: number,
  status: "completed" | "failed" | "partial",
  notes?: string
): Promise<void> {
  await db
    .updateTable("import_batches")
    .set({
      status,
      notes,
    })
    .where("id", "=", importBatchId)
    .execute();
}

async function insertSpectraBatch(
  batch: SpectrumJsonRow[],
  importBatchId: number,
  mode: SpectraImportMode
): Promise<{
  skippedMissingCompounds: number;
  skippedMalformedRows: number;
  insertedSpectra: number;
  insertedPeaks: number;
}> {
  if (batch.length === 0) {
    return {
      skippedMissingCompounds: 0,
      skippedMalformedRows: 0,
      insertedSpectra: 0,
      insertedPeaks: 0,
    };
  }

  return db.transaction().execute(async (trx) => {
    const accessions = Array.from(
      new Set(
        batch
          .map((row) => normalizeAccession(row.compound_accession))
          .filter((accession): accession is string => accession !== null)
      )
    );

    const compounds =
      accessions.length > 0
        ? await trx.selectFrom("compounds").select(["id", "accession"]).where("accession", "in", accessions).execute()
        : [];

    const compoundIdByAccession = new Map(compounds.map((compound) => [compound.accession, compound.id]));

    let skippedMissingCompounds = 0;
    let skippedMalformedRows = 0;

    const spectraRows: NormalizedSpectrumRow[] = [];

    const sourceRowsForInsertedSpectra: Array<{
      source: SpectrumJsonRow;
      compoundId: number;
      hmdbSpectrumId: number;
    }> = [];

    for (const row of batch) {
      const accession = normalizeAccession(row.compound_accession);

      if (!accession) {
        skippedMalformedRows += 1;
        continue;
      }

      const compoundId = compoundIdByAccession.get(accession);

      if (!compoundId) {
        skippedMissingCompounds += 1;
        continue;
      }

      const hmdbSpectrumId = toRequiredInteger(row.spectrum_id);

      if (hmdbSpectrumId === null) {
        skippedMalformedRows += 1;
        continue;
      }

      spectraRows.push({
        import_batch_id: importBatchId,
        compound_id: compoundId,
        hmdb_spectrum_id: hmdbSpectrumId,
        predicted: mode === "predicted",
        ionization_mode: row.ionization_mode ?? null,
        polarity: normalizePolarity(row.polarity),
        instrument_type: row.instrument_type ?? null,
        collision_energy_voltage: toNullableNumber(row.collision_energy_voltage),
        splash_key: row.splash_key ?? null,
        peak_counter: toNullableInteger(row.peak_counter),
        raw_metadata: toJsonbString(row.raw_metadata),
      });

      sourceRowsForInsertedSpectra.push({
        source: row,
        compoundId,
        hmdbSpectrumId,
      });
    }

    if (spectraRows.length === 0) {
      return {
        skippedMissingCompounds,
        skippedMalformedRows,
        insertedSpectra: 0,
        insertedPeaks: 0,
      };
    }

    const insertedSpectra = await trx
      .insertInto("spectra")
      .values(spectraRows)
      .onConflict((oc) => oc.columns(["hmdb_spectrum_id", "compound_id"]).doNothing())
      .returning(["id", "compound_id", "hmdb_spectrum_id"])
      .execute();

    const insertedSpectrumIdByKey = new Map(
      insertedSpectra.map((spectrum) => [`${spectrum.compound_id}:${spectrum.hmdb_spectrum_id}`, spectrum.id])
    );

    const peakRows: PeakInsertRow[] = [];

    for (const row of sourceRowsForInsertedSpectra) {
      const spectrumId = insertedSpectrumIdByKey.get(`${row.compoundId}:${row.hmdbSpectrumId}`);

      if (!spectrumId) {
        continue;
      }

      for (const peak of row.source.peaks ?? []) {
        const massCharge = toRequiredNumber(peak.mass_charge);

        if (massCharge === null) {
          skippedMalformedRows += 1;
          continue;
        }

        peakRows.push({
          spectrum_id: spectrumId,
          hmdb_peak_id: toNullableInteger(peak.peak_id),
          hmdb_msms_id: toNullableInteger(peak.msms_id),
          mass_charge: massCharge,
          raw_intensity: toNullableNumber(peak.raw_intensity),
          normalized_intensity: toNullableNumber(peak.normalized_intensity),
        });
      }
    }

    let insertedPeakCount = 0;

    for (const chunk of chunkRows(peakRows, 5000)) {
      if (chunk.length === 0) {
        continue;
      }

      await trx
        .insertInto("spectrum_peaks")
        .values(chunk)
        .onConflict((oc) => oc.doNothing())
        .execute();

      insertedPeakCount += chunk.length;
    }

    return {
      skippedMissingCompounds,
      skippedMalformedRows,
      insertedSpectra: insertedSpectra.length,
      insertedPeaks: insertedPeakCount,
    };
  });
}

async function main(): Promise<void> {
  const mode = getMode();
  const filePath = getSpectraFilePath(mode);
  const batchSize = getImportBatchSize();
  const maxRows = getImportMaxRows();

  const importBatchId = await createImportBatch(mode, filePath);

  const batch: SpectrumJsonRow[] = [];

  let totalRows = 0;
  let totalSkippedMissingCompounds = 0;
  let totalSkippedMalformedRows = 0;
  let totalInsertedSpectra = 0;
  let totalInsertedPeaks = 0;

  console.log(`Importing ${mode} spectra from: ${filePath}`);
  console.log(`Batch size: ${batchSize}`);

  if (maxRows) {
    console.log(`Test mode enabled. Max rows: ${maxRows}`);
  }

  try {
    for await (const row of readJsonlGz<SpectrumJsonRow>(filePath)) {
      if (maxRows && totalRows >= maxRows) {
        break;
      }

      batch.push(row);
      totalRows += 1;

      if (batch.length >= batchSize) {
        const result = await insertSpectraBatch(batch, importBatchId, mode);

        totalSkippedMissingCompounds += result.skippedMissingCompounds;
        totalSkippedMalformedRows += result.skippedMalformedRows;
        totalInsertedSpectra += result.insertedSpectra;
        totalInsertedPeaks += result.insertedPeaks;

        console.log(
          [
            `Processed source rows: ${totalRows}`,
            `inserted spectra: ${totalInsertedSpectra}`,
            `inserted peaks: ${totalInsertedPeaks}`,
            `skipped missing compounds: ${totalSkippedMissingCompounds}`,
            `skipped malformed rows/peaks: ${totalSkippedMalformedRows}`,
          ].join("; ")
        );

        clearBatch(batch);
      }
    }

    if (batch.length > 0) {
      const result = await insertSpectraBatch(batch, importBatchId, mode);

      totalSkippedMissingCompounds += result.skippedMissingCompounds;
      totalSkippedMalformedRows += result.skippedMalformedRows;
      totalInsertedSpectra += result.insertedSpectra;
      totalInsertedPeaks += result.insertedPeaks;

      clearBatch(batch);
    }

    await updateImportBatchStatus(
      importBatchId,
      "completed",
      [
        `Processed ${totalRows} ${mode} spectrum source rows.`,
        `Inserted ${totalInsertedSpectra} new spectra.`,
        `Inserted ${totalInsertedPeaks} new peaks.`,
        `Skipped ${totalSkippedMissingCompounds} rows with missing compounds.`,
        `Skipped ${totalSkippedMalformedRows} malformed rows/peaks.`,
        `Duplicate spectra/peaks were skipped.`,
      ].join(" ")
    );

    console.log(`${mode} spectra import completed.`);
    console.log(`Source rows processed: ${totalRows}`);
    console.log(`New spectra inserted: ${totalInsertedSpectra}`);
    console.log(`New peaks inserted: ${totalInsertedPeaks}`);
    console.log(`Skipped missing compounds: ${totalSkippedMissingCompounds}`);
    console.log(`Skipped malformed rows/peaks: ${totalSkippedMalformedRows}`);
  } catch (error) {
    await updateImportBatchStatus(
      importBatchId,
      "failed",
      `Failed after processing ${totalRows} ${mode} spectrum source rows.`
    );

    throw error;
  }
}

main()
  .catch((error) => {
    console.error("Spectra import failed.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });
