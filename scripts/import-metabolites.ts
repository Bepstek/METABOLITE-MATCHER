import "./load-env";
import path from "node:path";
import { db } from "../src/db/kysely";
import {
  clearBatch,
  getImportBatchSize,
  readJsonlGz,
} from "../src/services/import-utils";

interface MetaboliteSourceRow {
  term: string;
  level: number;
  parent_term?: string | null;
}

interface MetaboliteJsonRow {
  accession: string;
  name: string;
  chemical_formula?: string | null;
  average_molecular_weight?: string | number | null;
  monoisotopic_molecular_weight?: string | number | null;
  iupac_name?: string | null;
  traditional_iupac?: string | null;
  sources_hierarchy?: MetaboliteSourceRow[] | null;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toJsonbString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function getImportMaxRows(): number | null {
  const rawValue = process.env.IMPORT_MAX_ROWS;

  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAccession(accession: string): string {
  return accession.trim().toUpperCase();
}

function normalizeMetabolite(row: MetaboliteJsonRow, importBatchId: number) {
  return {
    import_batch_id: importBatchId,
    accession: normalizeAccession(row.accession),
    name: row.name,
    chemical_formula: row.chemical_formula ?? null,
    average_molecular_weight: toNullableNumber(row.average_molecular_weight),
    monoisotopic_molecular_weight: toNullableNumber(
      row.monoisotopic_molecular_weight
    ),
    iupac_name: row.iupac_name ?? null,
    traditional_iupac: row.traditional_iupac ?? null,
    sources_hierarchy: toJsonbString(row.sources_hierarchy),
  };
}

async function createImportBatch(sourceFilename: string): Promise<number> {
  const row = await db
    .insertInto("import_batches")
    .values({
      dataset_name: "all_metabolites",
      source_filename: sourceFilename,
      status: "running",
      notes: "Import from parsed HMDB metabolites JSONL.GZ",
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

function collectSourceNames(batch: MetaboliteJsonRow[]): string[] {
  const names = new Set<string>();

  for (const row of batch) {
    for (const source of row.sources_hierarchy ?? []) {
      if (source.term) {
        names.add(source.term);
      }

      if (source.parent_term) {
        names.add(source.parent_term);
      }
    }
  }

  return Array.from(names);
}

async function insertMetaboliteBatch(
  batch: MetaboliteJsonRow[],
  importBatchId: number
): Promise<void> {
  if (batch.length === 0) {
    return;
  }

  await db.transaction().execute(async (trx) => {
    const compoundRows = batch.map((row) =>
      normalizeMetabolite(row, importBatchId)
    );

    await trx
      .insertInto("compounds")
      .values(compoundRows)
      .onConflict((oc) => oc.column("accession").doNothing())
      .execute();

    const accessions = compoundRows.map((row) => row.accession);

    const compounds = await trx
      .selectFrom("compounds")
      .select(["id", "accession"])
      .where("accession", "in", accessions)
      .execute();

    const compoundIdByAccession = new Map(
      compounds.map((compound) => [compound.accession, compound.id])
    );

    const sourceNames = collectSourceNames(batch);

    if (sourceNames.length > 0) {
      await trx
        .insertInto("source_terms")
        .values(sourceNames.map((name) => ({ name })))
        .onConflict((oc) => oc.column("name").doNothing())
        .execute();
    }

    const sourceTerms =
      sourceNames.length > 0
        ? await trx
            .selectFrom("source_terms")
            .select(["id", "name"])
            .where("name", "in", sourceNames)
            .execute()
        : [];

    const sourceTermIdByName = new Map(
      sourceTerms.map((sourceTerm) => [sourceTerm.name, sourceTerm.id])
    );

    const sourceRows = batch.flatMap((row) => {
      const accession = normalizeAccession(row.accession);
      const compoundId = compoundIdByAccession.get(accession);

      if (!compoundId || !row.sources_hierarchy?.length) {
        return [];
      }

      return row.sources_hierarchy
        .filter((source) => source.term && Number.isFinite(source.level))
        .map((source) => {
          const sourceTermId = sourceTermIdByName.get(source.term);

          if (!sourceTermId) {
            return null;
          }

          const parentSourceTermId = source.parent_term
            ? sourceTermIdByName.get(source.parent_term) ?? null
            : null;

          return {
            compound_id: compoundId,
            source_term_id: sourceTermId,
            parent_source_term_id: parentSourceTermId,
            level: source.level,
          };
        })
        .filter((sourceRow): sourceRow is NonNullable<typeof sourceRow> => {
          return sourceRow !== null;
        });
    });

    if (sourceRows.length > 0) {
      await trx
        .insertInto("compound_sources")
        .values(sourceRows)
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  });
}

async function main(): Promise<void> {
  const filePath = process.env.METABOLITES_JSONL_GZ
    ? path.resolve(process.env.METABOLITES_JSONL_GZ)
    : path.resolve("datasets/parsed/hmdb_metabolites.jsonl.gz");

  const batchSize = getImportBatchSize();
  const maxRows = getImportMaxRows();
  const importBatchId = await createImportBatch(filePath);

  const batch: MetaboliteJsonRow[] = [];
  let totalRows = 0;

  console.log(`Importing metabolites from: ${filePath}`);
  console.log(`Batch size: ${batchSize}`);

  if (maxRows) {
    console.log(`Test mode enabled. Max rows: ${maxRows}`);
  }

  try {
    for await (const row of readJsonlGz<MetaboliteJsonRow>(filePath)) {
      if (maxRows && totalRows >= maxRows) {
        break;
      }

      batch.push(row);
      totalRows += 1;

      if (batch.length >= batchSize) {
        await insertMetaboliteBatch(batch, importBatchId);
        console.log(`Imported/processed ${totalRows} metabolite rows...`);
        clearBatch(batch);
      }
    }

    if (batch.length > 0) {
      await insertMetaboliteBatch(batch, importBatchId);
      clearBatch(batch);
    }

    await updateImportBatchStatus(
      importBatchId,
      "completed",
      `Processed ${totalRows} metabolite rows. Duplicate accessions/source rows were skipped.`
    );

    console.log(`Metabolite import completed. Rows processed: ${totalRows}`);
  } catch (error) {
    await updateImportBatchStatus(
      importBatchId,
      "failed",
      `Failed after processing ${totalRows} metabolite rows.`
    );

    throw error;
  }
}

main()
  .catch((error) => {
    console.error("Metabolite import failed.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });