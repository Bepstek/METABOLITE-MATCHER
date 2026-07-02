import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DB } from "../db/schema";
import type { IonMode } from "./metadata.repository";

export type SpectrumKind = "predicted" | "experimental" | "both";
export type SpectrumPolarity = "positive" | "negative" | "both";

export type NeutralMassSearchInput = {
  queryMass: number;

  lowerMass: number;
  upperMass: number;

  tolerance?: number;
  toleranceUnit: "ppm" | "da";
  sourceTermId?: number;

  limit: number;
  offset: number;

  sortBy?: NeutralMassSortBy;
  sortDirection: SortDirection;
};

export type NeutralMassSearchRow = {
  compound_id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  monoisotopic_molecular_weight: number;
  average_molecular_weight: number | null;
};

export type NeutralMassSortBy =
  | "accession"
  | "name"
  | "chemicalFormula"
  | "monoisotopicMolecularWeight"
  | "averageMolecularWeight"
  | "massErrorPpm";

export type AdductMzSearchInput = {
  queryMz: number;
  lowerMz: number;
  upperMz: number;
  ionMode: IonMode;
  adductIds: number[];
  sourceTermId?: number;
  limit: number;
  offset: number;
  sortBy?: AdductMzSortBy;
  sortDirection: SortDirection;
};

export type AdductMzSortBy =
  | "accession"
  | "name"
  | "chemicalFormula"
  | "monoisotopicMolecularWeight"
  | "adductLabel"
  | "theoreticalMz"
  | "massErrorPpm";

export type SortDirection = "asc" | "desc";

export type AdductMzSearchRow = {
  compound_id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  monoisotopic_molecular_weight: number | null;
  average_molecular_weight: number | null;
  adduct_id: number;
  adduct_label: string;
  ion_mode: IonMode;
  theoretical_mz: number;
};

export type FragmentMassSearchInput = {
  queryMz: number;
  lowerMz: number;
  upperMz: number;
  spectrumKind: SpectrumKind;
  polarity: SpectrumPolarity;
  minNormalizedIntensity?: number;
  sourceTermId?: number;
  limit: number;
  offset: number;
};

export type FragmentMassSearchRow = {
  compound_id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  spectrum_id: number;
  hmdb_spectrum_id: number;
  predicted: boolean;
  ionization_mode: string | null;
  polarity: string | null;
  instrument_type: string | null;
  collision_energy_voltage: number | null;
  peak_id: string | number;
  hmdb_peak_id: number | null;
  hmdb_msms_id: number | null;
  mass_charge: number;
  raw_intensity: number | null;
  normalized_intensity: number | null;
};

export type CompoundAdductSummaryRow = {
  adduct_id: number;
  adduct_label: string;
  ion_mode: IonMode;
  charge: number;
  mass_multiplier: number;
  mass_shift: number;
  theoretical_mz: number;
  enabled: boolean;
};

function parseCount(value: unknown): number {
  if (value == null) return 0;

  const count = Number(value);
  if (!Number.isFinite(count)) {
    throw new Error(`Invalid count value: ${String(value)}`);
  }

  return count;
}

function withSourceFilterForCompounds<T>(query: T, sourceTermId: number | undefined): T {
  if (sourceTermId === undefined) return query;

  return (query as any).where((eb: any) =>
    eb.exists(
      eb
        .selectFrom("compound_sources")
        .select("compound_sources.id")
        .whereRef("compound_sources.compound_id", "=", "compounds.id")
        .where("compound_sources.source_term_id", "=", sourceTermId)
    )
  );
}

function baseNeutralMassQuery(db: Kysely<DB>, input: Omit<NeutralMassSearchInput, "limit" | "offset">) {
  let query = db
    .selectFrom("compounds")
    .where("compounds.monoisotopic_molecular_weight", "is not", null)
    .where("compounds.monoisotopic_molecular_weight", ">=", input.lowerMass)
    .where("compounds.monoisotopic_molecular_weight", "<=", input.upperMass);

  query = withSourceFilterForCompounds(query, input.sourceTermId);

  return query;
}

function applyNeutralMassOrdering<T extends { orderBy: (...args: any[]) => any }>(
  query: T,
  input: NeutralMassSearchInput
): T {
  const direction = input.sortDirection ?? "asc";

  const massErrorDa = sql<number>`
    compounds.monoisotopic_molecular_weight - ${input.queryMass}
  `;

  const massErrorPpm = sql<number>`
    ((compounds.monoisotopic_molecular_weight - ${input.queryMass}) / compounds.monoisotopic_molecular_weight) * 1000000
  `;

  if (input.sortBy === "accession") {
    return query
      .orderBy("compounds.accession", direction)
      .orderBy("compounds.name", "asc") as T;
  }

  if (input.sortBy === "name") {
    return query
      .orderBy("compounds.name", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "chemicalFormula") {
    return query
      .orderBy(
        sql<number>`case when compounds.chemical_formula is null then 1 else 0 end`,
        "asc"
      )
      .orderBy("compounds.chemical_formula", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "monoisotopicMolecularWeight") {
    return query
      .orderBy(
        sql<number>`case when compounds.monoisotopic_molecular_weight is null then 1 else 0 end`,
        "asc"
      )
      .orderBy("compounds.monoisotopic_molecular_weight", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "averageMolecularWeight") {
    return query
      .orderBy(
        sql<number>`case when compounds.average_molecular_weight is null then 1 else 0 end`,
        "asc"
      )
      .orderBy("compounds.average_molecular_weight", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "massErrorPpm") {
    return query
      .orderBy(sql<number>`abs(${massErrorPpm})`, direction)
      .orderBy(massErrorPpm, direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  // Default scientific order: closest neutral mass first.
  return query
    .orderBy(sql<number>`abs(${massErrorDa})`, "asc")
    .orderBy("compounds.name", "asc")
    .orderBy("compounds.accession", "asc") as T;
}

export async function searchNeutralMass(
  db: Kysely<DB>,
  input: NeutralMassSearchInput
): Promise<NeutralMassSearchRow[]> {
  return applyNeutralMassOrdering(
    baseNeutralMassQuery(db, input).select([
      "compounds.id as compound_id",
      "compounds.accession",
      "compounds.name",
      "compounds.chemical_formula",
      "compounds.monoisotopic_molecular_weight",
      "compounds.average_molecular_weight",
    ]),
    input
  )
    .limit(input.limit)
    .offset(input.offset)
    .execute() as Promise<NeutralMassSearchRow[]>;
}

export async function countNeutralMass(
  db: Kysely<DB>,
  input: Omit<NeutralMassSearchInput, "limit" | "offset">
): Promise<number> {
  const row = await baseNeutralMassQuery(db, input)
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  return parseCount(row?.count);
}

function baseAdductMzQuery(db: Kysely<DB>, input: Omit<AdductMzSearchInput, "limit" | "offset">) {
  let query = db
    .selectFrom("compound_adducts")
    .innerJoin("compounds", "compounds.id", "compound_adducts.compound_id")
    .innerJoin("adducts", "adducts.id", "compound_adducts.adduct_id")
    .where("compound_adducts.theoretical_mz", ">=", input.lowerMz)
    .where("compound_adducts.theoretical_mz", "<=", input.upperMz)
    .where("adducts.ion_mode", "=", input.ionMode)
    .where("adducts.enabled", "=", true)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("adduct_blacklist")
            .select("adduct_blacklist.id")
            .whereRef("adduct_blacklist.adduct_id", "=", "adducts.id")
            .where("adduct_blacklist.active", "=", true)
        )
      )
    );

  if (input.adductIds.length > 0) {
    query = query.where("compound_adducts.adduct_id", "in", input.adductIds);
  }

  query = withSourceFilterForCompounds(query, input.sourceTermId);

  return query;
}

function applyAdductMzOrdering<T extends { orderBy: (...args: any[]) => any }>(
  query: T,
  input: AdductMzSearchInput
): T {
  const direction = input.sortDirection ?? "asc";

  const massErrorDa = sql<number>`
    compound_adducts.theoretical_mz - ${input.queryMz}
  `;

  const massErrorPpm = sql<number>`
    ((compound_adducts.theoretical_mz - ${input.queryMz}) / compound_adducts.theoretical_mz) * 1000000
  `;

  if (input.sortBy === "accession") {
    return query
      .orderBy("compounds.accession", direction)
      .orderBy("compounds.name", "asc") as T;
  }

  if (input.sortBy === "name") {
    return query
      .orderBy("compounds.name", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "chemicalFormula") {
    return query
      .orderBy(
        sql<number>`case when compounds.chemical_formula is null then 1 else 0 end`,
        "asc"
      )
      .orderBy("compounds.chemical_formula", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "monoisotopicMolecularWeight") {
    return query
      .orderBy(
        sql<number>`case when compounds.monoisotopic_molecular_weight is null then 1 else 0 end`,
        "asc"
      )
      .orderBy("compounds.monoisotopic_molecular_weight", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "adductLabel") {
    return query
      .orderBy("adducts.label", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "theoreticalMz") {
    return query
      .orderBy("compound_adducts.theoretical_mz", direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "massErrorPpm") {
    return query
      .orderBy(sql<number>`abs(${massErrorPpm})`, direction)
      .orderBy(massErrorPpm, direction)
      .orderBy("compounds.accession", "asc") as T;
  }

  return query
    .orderBy(sql<number>`abs(${massErrorDa})`, "asc")
    .orderBy("adducts.label", "asc")
    .orderBy("compounds.name", "asc")
    .orderBy("compounds.accession", "asc") as T;
}

export async function searchAdductMz(
  db: Kysely<DB>,
  input: AdductMzSearchInput
): Promise<AdductMzSearchRow[]> {
  return applyAdductMzOrdering(
    baseAdductMzQuery(db, input).select([
      "compounds.id as compound_id",
      "compounds.accession",
      "compounds.name",
      "compounds.chemical_formula",
      "compounds.monoisotopic_molecular_weight",
      "compounds.average_molecular_weight",
      "adducts.id as adduct_id",
      "adducts.label as adduct_label",
      "adducts.ion_mode as ion_mode",
      "compound_adducts.theoretical_mz",
    ]),
    input
  )
    .limit(input.limit)
    .offset(input.offset)
    .execute() as Promise<AdductMzSearchRow[]>;
}

export async function countAdductMz(
  db: Kysely<DB>,
  input: Omit<AdductMzSearchInput, "limit" | "offset">
): Promise<number> {
  const row = await baseAdductMzQuery(db, input)
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  return parseCount(row?.count);
}

export async function listCompoundAdductsByAccession(
  db: Kysely<DB>,
  accession: string
): Promise<CompoundAdductSummaryRow[]> {
  return db
    .selectFrom("compound_adducts")
    .innerJoin("compounds", "compounds.id", "compound_adducts.compound_id")
    .innerJoin("adducts", "adducts.id", "compound_adducts.adduct_id")
    .select([
      "adducts.id as adduct_id",
      "adducts.label as adduct_label",
      "adducts.ion_mode as ion_mode",
      "adducts.charge",
      "adducts.mass_multiplier",
      "adducts.mass_shift",
      "compound_adducts.theoretical_mz",
      "adducts.enabled",
    ])
    .where("compounds.accession", "=", accession)
    .orderBy("adducts.ion_mode", "asc")
    .orderBy("adducts.label", "asc")
    .execute() as Promise<CompoundAdductSummaryRow[]>;
}

function baseFragmentMassQuery(db: Kysely<DB>, input: Omit<FragmentMassSearchInput, "limit" | "offset">) {
  let query = db
    .selectFrom("spectrum_peaks")
    .innerJoin("spectra", "spectra.id", "spectrum_peaks.spectrum_id")
    .innerJoin("compounds", "compounds.id", "spectra.compound_id")
    .where("spectrum_peaks.mass_charge", ">=", input.lowerMz)
    .where("spectrum_peaks.mass_charge", "<=", input.upperMz);

  if (input.spectrumKind === "predicted") {
    query = query.where("spectra.predicted", "=", true);
  }

  if (input.spectrumKind === "experimental") {
    query = query.where("spectra.predicted", "=", false);
  }

  if (input.polarity === "positive") {
    query = query.where("spectra.polarity", "=", "positive");
  }

  if (input.polarity === "negative") {
    query = query.where("spectra.polarity", "=", "negative");
  }

  if (input.minNormalizedIntensity !== undefined) {
    query = query.where("spectrum_peaks.normalized_intensity", ">=", input.minNormalizedIntensity);
  }

  query = withSourceFilterForCompounds(query, input.sourceTermId);

  return query;
}

/**
 * Primitive fragment peak m/z lookup.
 *
 * This is intentionally NOT cosine similarity, NOT spectral similarity scoring,
 * and NOT final LC-MS/MS identification logic.
 */
export async function searchFragmentMass(
  db: Kysely<DB>,
  input: FragmentMassSearchInput
): Promise<FragmentMassSearchRow[]> {
  return baseFragmentMassQuery(db, input)
    .select([
      "compounds.id as compound_id",
      "compounds.accession",
      "compounds.name",
      "compounds.chemical_formula",
      "spectra.id as spectrum_id",
      "spectra.hmdb_spectrum_id",
      "spectra.predicted",
      "spectra.ionization_mode",
      "spectra.polarity",
      "spectra.instrument_type",
      "spectra.collision_energy_voltage",
      "spectrum_peaks.id as peak_id",
      "spectrum_peaks.hmdb_peak_id",
      "spectrum_peaks.hmdb_msms_id",
      "spectrum_peaks.mass_charge",
      "spectrum_peaks.raw_intensity",
      "spectrum_peaks.normalized_intensity",
    ])
    .orderBy(sql<number>`abs(spectrum_peaks.mass_charge - ${input.queryMz})`, "asc")
    .orderBy(sql<number>`case when spectrum_peaks.normalized_intensity is null then 1 else 0 end`, "asc")
    .orderBy("spectrum_peaks.normalized_intensity", "desc")
    .orderBy("compounds.name", "asc")
    .orderBy("compounds.accession", "asc")
    .orderBy("spectra.hmdb_spectrum_id", "asc")
    .orderBy("spectrum_peaks.id", "asc")
    .limit(input.limit)
    .offset(input.offset)
    .execute() as Promise<FragmentMassSearchRow[]>;
}

export async function countFragmentMass(
  db: Kysely<DB>,
  input: Omit<FragmentMassSearchInput, "limit" | "offset">
): Promise<number> {
  const row = await baseFragmentMassQuery(db, input)
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  return parseCount(row?.count);
}
