import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DB } from "../db/schema";

export type SpectrumKindFilter = "experimental" | "predicted" | "both";
export type SpectrumPolarityFilter = "positive" | "negative" | "both";
export type ToleranceUnit = "da" | "ppm";

export type SpectrumWithCompoundRow = {
  id: number;
  hmdb_spectrum_id: number;
  predicted: boolean;
  ionization_mode: string | null;
  polarity: string | null;
  instrument_type: string | null;
  collision_energy_voltage: number | null;
  splash_key: string | null;
  peak_counter: number | null;
  raw_metadata: unknown;
  compound_id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  monoisotopic_molecular_weight: number | null;
  average_molecular_weight: number | null;
};

export type SpectrumPeakRow = {
  id: string | number;
  spectrum_id?: number;
  hmdb_peak_id: number | null;
  hmdb_msms_id: number | null;
  mass_charge: number;
  raw_intensity: number | null;
  normalized_intensity: number | null;
};

export type MsMsCandidateQueryWindow = {
  queryIndex: number;
  lowerMz: number;
  upperMz: number;
};

export type MsMsCandidateSearchInput = {
  queryWindows: MsMsCandidateQueryWindow[];
  spectrumKind: SpectrumKindFilter;
  polarity: SpectrumPolarityFilter;
  candidateCompoundIds?: number[];
  sourceTermId?: number;
  minMatchedPeaks: number;
  candidateLimit: number;
};

export type MsMsCandidateSpectrumRow = SpectrumWithCompoundRow & {
  matched_peak_count: number;
};

export type PrecursorAdductCandidateInput = {
  precursorMz: number;
  tolerance: number;
  toleranceUnit: ToleranceUnit;
  polarity: SpectrumPolarityFilter;
  adductIds: number[];
  sourceTermId?: number;
};

export type PrecursorAdductCandidateRow = {
  compound_id: number;
  matched_adduct_count: number;
};

function getToleranceDa(mz: number, tolerance: number, toleranceUnit: ToleranceUnit) {
  return toleranceUnit === "ppm" ? (mz * tolerance) / 1_000_000 : tolerance;
}

function parseCount(value: unknown): number {
  if (value == null) return 0;

  const count = Number(value);
  if (!Number.isFinite(count)) {
    throw new Error(`Invalid count value: ${String(value)}`);
  }

  return count;
}

export async function findCompoundIdsByPrecursorAdductMz(
  db: Kysely<DB>,
  input: PrecursorAdductCandidateInput
): Promise<PrecursorAdductCandidateRow[]> {
  const toleranceDa = getToleranceDa(input.precursorMz, input.tolerance, input.toleranceUnit);
  const lowerMz = input.precursorMz - toleranceDa;
  const upperMz = input.precursorMz + toleranceDa;

  const polarityFilter =
    input.polarity === "positive"
      ? sql`and adducts.ion_mode = 'positive'`
      : input.polarity === "negative"
        ? sql`and adducts.ion_mode = 'negative'`
        : sql``;

  const adductFilter = input.adductIds.length > 0 ? sql`and adducts.id in (${sql.join(input.adductIds)})` : sql``;

  const sourceFilter =
    input.sourceTermId === undefined
      ? sql``
      : sql`
      and exists (
        select 1
        from compound_sources
        where compound_sources.compound_id = compound_adducts.compound_id
          and compound_sources.source_term_id = ${input.sourceTermId}
      )
    `;

  const result = await sql<PrecursorAdductCandidateRow>`
    select
      compound_adducts.compound_id,
      count(*)::int as matched_adduct_count
    from compound_adducts
    inner join adducts
      on adducts.id = compound_adducts.adduct_id
    where compound_adducts.theoretical_mz >= ${lowerMz}::double precision
      and compound_adducts.theoretical_mz <= ${upperMz}::double precision
      and adducts.enabled = true
      ${polarityFilter}
      ${adductFilter}
      ${sourceFilter}
    group by compound_adducts.compound_id
    order by compound_adducts.compound_id asc
  `.execute(db);

  return result.rows;
}

export async function findSpectrumByHmdbSpectrumId(
  db: Kysely<DB>,
  hmdbSpectrumId: number
): Promise<SpectrumWithCompoundRow | undefined> {
  return db
    .selectFrom("spectra")
    .innerJoin("compounds", "compounds.id", "spectra.compound_id")
    .select([
      "spectra.id",
      "spectra.hmdb_spectrum_id",
      "spectra.predicted",
      "spectra.ionization_mode",
      "spectra.polarity",
      "spectra.instrument_type",
      "spectra.collision_energy_voltage",
      "spectra.splash_key",
      "spectra.peak_counter",
      "spectra.raw_metadata",
      "compounds.id as compound_id",
      "compounds.accession",
      "compounds.name",
      "compounds.chemical_formula",
      "compounds.monoisotopic_molecular_weight",
      "compounds.average_molecular_weight",
    ])
    .where("spectra.hmdb_spectrum_id", "=", hmdbSpectrumId)
    .executeTakeFirst() as Promise<SpectrumWithCompoundRow | undefined>;
}

export async function listSpectrumPeaksBySpectrumId(db: Kysely<DB>, spectrumId: number): Promise<SpectrumPeakRow[]> {
  return db
    .selectFrom("spectrum_peaks")
    .select([
      "spectrum_peaks.id",
      "spectrum_peaks.hmdb_peak_id",
      "spectrum_peaks.hmdb_msms_id",
      "spectrum_peaks.mass_charge",
      "spectrum_peaks.raw_intensity",
      "spectrum_peaks.normalized_intensity",
    ])
    .where("spectrum_peaks.spectrum_id", "=", spectrumId)
    .orderBy("spectrum_peaks.mass_charge", "asc")
    .orderBy("spectrum_peaks.id", "asc")
    .execute() as Promise<SpectrumPeakRow[]>;
}

export async function findCandidateSpectraForMsMsSearch(
  db: Kysely<DB>,
  input: MsMsCandidateSearchInput
): Promise<MsMsCandidateSpectrumRow[]> {
  if (input.queryWindows.length === 0) return [];

  const queryWindowValues = sql.join(
    input.queryWindows.map(
      (window) => sql`(
    ${window.queryIndex}::int,
    ${window.lowerMz}::double precision,
    ${window.upperMz}::double precision
  )`
    ),
    sql`, `
  );

  const predictedFilter =
    input.spectrumKind === "predicted"
      ? sql`and spectra.predicted = true`
      : input.spectrumKind === "experimental"
        ? sql`and spectra.predicted = false`
        : sql``;

  const polarityFilter =
    input.polarity === "positive"
      ? sql`and spectra.polarity = 'positive'`
      : input.polarity === "negative"
        ? sql`and spectra.polarity = 'negative'`
        : sql``;

  const sourceFilter =
    input.sourceTermId === undefined
      ? sql``
      : sql`
        and exists (
          select 1
          from compound_sources
          where compound_sources.compound_id = compounds.id
            and compound_sources.source_term_id = ${input.sourceTermId}
        )
      `;

  const candidateCompoundFilter =
    input.candidateCompoundIds && input.candidateCompoundIds.length > 0
      ? sql`and spectra.compound_id in (${sql.join(input.candidateCompoundIds)})`
      : sql``;

  const result = await sql<MsMsCandidateSpectrumRow>`
    with query_windows(query_index, lower_mz, upper_mz) as (
      values ${queryWindowValues}
    )
    select
      spectra.id,
      spectra.hmdb_spectrum_id,
      spectra.predicted,
      spectra.ionization_mode,
      spectra.polarity,
      spectra.instrument_type,
      spectra.collision_energy_voltage,
      spectra.splash_key,
      spectra.peak_counter,
      spectra.raw_metadata,
      compounds.id as compound_id,
      compounds.accession,
      compounds.name,
      compounds.chemical_formula,
      compounds.monoisotopic_molecular_weight,
      compounds.average_molecular_weight,
      count(distinct query_windows.query_index)::int as matched_peak_count
    from query_windows
    inner join spectrum_peaks
      on spectrum_peaks.mass_charge >= query_windows.lower_mz
      and spectrum_peaks.mass_charge <= query_windows.upper_mz
      and spectrum_peaks.normalized_intensity is not null
    inner join spectra
      on spectra.id = spectrum_peaks.spectrum_id
    inner join compounds
      on compounds.id = spectra.compound_id
    where 1 = 1
      ${predictedFilter}
      ${polarityFilter}
      ${candidateCompoundFilter}
      ${sourceFilter}
    group by
      spectra.id,
      spectra.hmdb_spectrum_id,
      spectra.predicted,
      spectra.ionization_mode,
      spectra.polarity,
      spectra.instrument_type,
      spectra.collision_energy_voltage,
      spectra.splash_key,
      spectra.peak_counter,
      spectra.raw_metadata,
      compounds.id,
      compounds.accession,
      compounds.name,
      compounds.chemical_formula,
      compounds.monoisotopic_molecular_weight,
      compounds.average_molecular_weight
    having count(distinct query_windows.query_index) >= ${input.minMatchedPeaks}
    order by matched_peak_count desc, spectra.hmdb_spectrum_id asc
    limit ${input.candidateLimit}
  `.execute(db);

  return result.rows;
}

export async function listSpectrumPeaksBySpectrumIds(
  db: Kysely<DB>,
  spectrumIds: number[]
): Promise<Array<SpectrumPeakRow & { spectrum_id: number }>> {
  if (spectrumIds.length === 0) return [];

  return db
    .selectFrom("spectrum_peaks")
    .select([
      "spectrum_peaks.id",
      "spectrum_peaks.spectrum_id",
      "spectrum_peaks.hmdb_peak_id",
      "spectrum_peaks.hmdb_msms_id",
      "spectrum_peaks.mass_charge",
      "spectrum_peaks.raw_intensity",
      "spectrum_peaks.normalized_intensity",
    ])
    .where("spectrum_peaks.spectrum_id", "in", spectrumIds)
    .where("spectrum_peaks.normalized_intensity", "is not", null)
    .orderBy("spectrum_peaks.spectrum_id", "asc")
    .orderBy("spectrum_peaks.mass_charge", "asc")
    .orderBy("spectrum_peaks.id", "asc")
    .execute() as Promise<Array<SpectrumPeakRow & { spectrum_id: number }>>;
}

export async function countSpectrumPeaksBySpectrumId(db: Kysely<DB>, spectrumId: number): Promise<number> {
  const row = await db
    .selectFrom("spectrum_peaks")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("spectrum_peaks.spectrum_id", "=", spectrumId)
    .executeTakeFirst();

  return parseCount(row?.count);
}
