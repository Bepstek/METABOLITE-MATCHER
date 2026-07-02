import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DB } from "../db/schema";

export type MlPolarity = "positive" | "negative" | "both";
export type MlSpectrumKind = "experimental" | "predicted" | "both";
export type MlToleranceUnit = "da" | "ppm";

export type MlAdductRow = {
  id: number;
  label: string;
  ion_mode: "positive" | "negative";
};

export type MlPrecursorAdductMatchRow = {
  compound_id: number;
  adduct_id: number;
  adduct_label: string;
  ion_mode: "positive" | "negative";
  theoretical_mz: number;
  mass_error_da: number;
  mass_error_ppm: number;
  absolute_mass_error_da: number;
  absolute_mass_error_ppm: number;
};

export type MlFragmentCandidateRow = {
  spectrum_id: number;
  hmdb_spectrum_id: number;
  compound_id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  predicted: boolean;
  ionization_mode: string | null;
  polarity: string | null;
  instrument_type: string | null;
  collision_energy_voltage: number | null;
  peak_counter: number | null;
  matched_query_peaks: number;
};

export type MlSpectrumPeakRow = {
  spectrum_id: number;
  mz: number;
  intensity: number;
  normalized_intensity: number | null;
  raw_intensity: number | null;
  hmdb_peak_id: number | null;
  hmdb_msms_id: number | null;
};

export type MlQueryWindow = {
  queryIndex: number;
  lowerMz: number;
  upperMz: number;
};

function polaritySql(polarity: MlPolarity, tableAlias: "adducts" | "spectra") {
  if (polarity === "positive") return sql`and ${sql.ref(`${tableAlias}.polarity`)} = 'positive'`;
  if (polarity === "negative") return sql`and ${sql.ref(`${tableAlias}.polarity`)} = 'negative'`;
  return sql``;
}

function adductIonModeSql(polarity: MlPolarity) {
  if (polarity === "positive") return sql`and adducts.ion_mode = 'positive'`;
  if (polarity === "negative") return sql`and adducts.ion_mode = 'negative'`;
  return sql``;
}

export function normalizeAdductLabel(label: string) {
  let normalized = label.trim().replace(/\s+/g, "");

  if (normalized.startsWith("[") && normalized.includes("]")) {
    normalized = normalized.slice(1, normalized.lastIndexOf("]"));
  }

  normalized = normalized.replace(/[+-]$/, "");

  return normalized;
}

export async function listAdductsForMlResolution(db: Kysely<DB>, polarity: MlPolarity): Promise<MlAdductRow[]> {
  let query = db
    .selectFrom("adducts")
    .select(["adducts.id", "adducts.label", "adducts.ion_mode"])
    .where("adducts.enabled", "=", true);

  if (polarity === "positive") query = query.where("adducts.ion_mode", "=", "positive");
  if (polarity === "negative") query = query.where("adducts.ion_mode", "=", "negative");

  return query.orderBy("adducts.label", "asc").execute() as Promise<MlAdductRow[]>;
}

export async function findExistingTargetAccessions(db: Kysely<DB>, accessions: string[]): Promise<string[]> {
  if (accessions.length === 0) return [];

  const rows = await db
    .selectFrom("compounds")
    .select("compounds.accession")
    .where("compounds.accession", "in", accessions)
    .execute();

  return rows.map((row) => row.accession);
}

export async function findPrecursorAdductMatchesForMl(
  db: Kysely<DB>,
  input: {
    precursorMz: number;
    tolerance: number;
    toleranceUnit: MlToleranceUnit;
    polarity: MlPolarity;
    adductIds: number[];
    sourceTermId?: number;
  },
): Promise<MlPrecursorAdductMatchRow[]> {
  const toleranceDa = input.toleranceUnit === "ppm" ? (input.precursorMz * input.tolerance) / 1_000_000 : input.tolerance;
  const lowerMz = input.precursorMz - toleranceDa;
  const upperMz = input.precursorMz + toleranceDa;

  const ionModeFilter = adductIonModeSql(input.polarity);
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

  const result = await sql<MlPrecursorAdductMatchRow>`
    select
      compound_adducts.compound_id,
      adducts.id as adduct_id,
      adducts.label as adduct_label,
      adducts.ion_mode,
      compound_adducts.theoretical_mz,
      (compound_adducts.theoretical_mz - ${input.precursorMz}::double precision) as mass_error_da,
      ((compound_adducts.theoretical_mz - ${input.precursorMz}::double precision) / compound_adducts.theoretical_mz) * 1000000 as mass_error_ppm,
      abs(compound_adducts.theoretical_mz - ${input.precursorMz}::double precision) as absolute_mass_error_da,
      abs(((compound_adducts.theoretical_mz - ${input.precursorMz}::double precision) / compound_adducts.theoretical_mz) * 1000000) as absolute_mass_error_ppm
    from compound_adducts
    inner join adducts
      on adducts.id = compound_adducts.adduct_id
    where compound_adducts.theoretical_mz >= ${lowerMz}::double precision
      and compound_adducts.theoretical_mz <= ${upperMz}::double precision
      and adducts.enabled = true
      and not exists (
        select 1
        from adduct_blacklist
        where adduct_blacklist.adduct_id = adducts.id
          and adduct_blacklist.active = true
      )
      ${ionModeFilter}
      ${adductFilter}
      ${sourceFilter}
    order by absolute_mass_error_ppm asc, compound_adducts.compound_id asc, adducts.label asc
  `.execute(db);

  return result.rows;
}

export async function findFragmentCandidatesForMl(
  db: Kysely<DB>,
  input: {
    queryWindows: MlQueryWindow[];
    spectrumKind: MlSpectrumKind;
    polarity: MlPolarity;
    candidateCompoundIds: number[];
    sourceTermId?: number;
    minMatchedPeaks: number;
    fragmentCandidateLimit: number;
  },
): Promise<MlFragmentCandidateRow[]> {
  if (input.queryWindows.length === 0 || input.candidateCompoundIds.length === 0) return [];

  const queryWindowValues = sql.join(
    input.queryWindows.map((window) => sql`(
      ${window.queryIndex}::int,
      ${window.lowerMz}::double precision,
      ${window.upperMz}::double precision
    )`),
    sql`, `,
  );

  const predictedFilter =
    input.spectrumKind === "experimental"
      ? sql`and spectra.predicted = false`
      : input.spectrumKind === "predicted"
        ? sql`and spectra.predicted = true`
        : sql``;

  const spectrumPolarityFilter =
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

  const result = await sql<MlFragmentCandidateRow>`
    with query_windows(query_index, lower_mz, upper_mz) as (
      values ${queryWindowValues}
    )
    select
      spectra.id as spectrum_id,
      spectra.hmdb_spectrum_id,
      compounds.id as compound_id,
      compounds.accession,
      compounds.name,
      compounds.chemical_formula,
      spectra.predicted,
      spectra.ionization_mode,
      spectra.polarity,
      spectra.instrument_type,
      spectra.collision_energy_voltage,
      spectra.peak_counter,
      count(distinct query_windows.query_index)::int as matched_query_peaks
    from spectra
    inner join compounds
      on compounds.id = spectra.compound_id
    inner join spectrum_peaks
      on spectrum_peaks.spectrum_id = spectra.id
    inner join query_windows
      on spectrum_peaks.mass_charge >= query_windows.lower_mz
     and spectrum_peaks.mass_charge <= query_windows.upper_mz
    where spectra.compound_id in (${sql.join(input.candidateCompoundIds)})
      ${predictedFilter}
      ${spectrumPolarityFilter}
      ${sourceFilter}
    group by
      spectra.id,
      spectra.hmdb_spectrum_id,
      compounds.id,
      compounds.accession,
      compounds.name,
      compounds.chemical_formula,
      spectra.predicted,
      spectra.ionization_mode,
      spectra.polarity,
      spectra.instrument_type,
      spectra.collision_energy_voltage,
      spectra.peak_counter
    having count(distinct query_windows.query_index) >= ${input.minMatchedPeaks}
    order by matched_query_peaks desc, spectra.hmdb_spectrum_id asc
    limit ${input.fragmentCandidateLimit}
  `.execute(db);

  return result.rows;
}

export async function loadSpectrumPeaksForMl(db: Kysely<DB>, spectrumIds: number[]): Promise<MlSpectrumPeakRow[]> {
  if (spectrumIds.length === 0) return [];

  return db
    .selectFrom("spectrum_peaks")
    .select([
      "spectrum_peaks.spectrum_id",
      "spectrum_peaks.mass_charge as mz",
      "spectrum_peaks.normalized_intensity as intensity",
      "spectrum_peaks.normalized_intensity",
      "spectrum_peaks.raw_intensity",
      "spectrum_peaks.hmdb_peak_id",
      "spectrum_peaks.hmdb_msms_id",
    ])
    .where("spectrum_peaks.spectrum_id", "in", spectrumIds)
    .orderBy("spectrum_peaks.mass_charge", "asc")
    .execute() as Promise<MlSpectrumPeakRow[]>;
}
