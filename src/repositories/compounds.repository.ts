import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DB } from "../db/schema";

export type FindCompoundByAccessionInput = {
  accession: string;
};

export type CompoundDetailRow = {
  id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  average_molecular_weight: number | null;
  monoisotopic_molecular_weight: number | null;
  iupac_name: string | null;
  traditional_iupac: string | null;
  sources_hierarchy: unknown;
  created_at: Date | string;
};

export type CompoundNameSearchInput = {
  query: string;
  sortBy?: CompoundNameSortBy;
  sortDirection: SortDirection;
  limit: number;
  offset: number;
};

export type CompoundNameSearchRow = {
  id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  average_molecular_weight: number | null;
  monoisotopic_molecular_weight: number | null;
};

export type CompoundSourceTermRow = {
  source_term_id: number;
  source_term_name: string;
  parent_source_term_id: number | null;
  parent_source_term_name: string | null;
  level: number;
};

export type CompoundSpectraListInput = {
  accession: string;
  spectrumKind: SpectrumKindFilter;
  polarity: SpectrumPolarityFilter;
  collisionMin?: number;
  collisionMax?: number;
  sortBy?: CompoundSpectraSortBy;
  sortDirection: SortDirection;
  limit: number;
  offset: number;
};

export type CompoundSpectrumRow = {
  id: number;
  compound_id: number;
  hmdb_spectrum_id: number;
  predicted: boolean;
  ionization_mode: string | null;
  polarity: string | null;
  instrument_type: string | null;
  collision_energy_voltage: number | null;
  splash_key: string | null;
  peak_counter: number | null;
  created_at: Date | string;
};

export type CompoundSpectraSortBy =
  | "hmdbSpectrumId"
  | "polarity"
  | "collisionEnergyVoltage"
  | "peakCounter";

export type SpectrumKindFilter = "both" | "experimental" | "predicted";
export type SpectrumPolarityFilter = "both" | "positive" | "negative";

export type CompoundNameSortBy = "accession" | "name" | "monoisotopicMolecularWeight" | "averageMolecularWeight";

export type SortDirection = "asc" | "desc";

function parseCount(value: unknown): number {
  if (value == null) return 0;

  const count = Number(value);
  if (!Number.isFinite(count)) {
    throw new Error(`Invalid count value: ${String(value)}`);
  }

  return count;
}

export async function findCompoundByAccession(
  db: Kysely<DB>,
  accession: string
): Promise<CompoundDetailRow | undefined> {
  const normalizedAccession = accession.trim().toUpperCase();

  return db
    .selectFrom("compounds")
    .select([
      "compounds.id",
      "compounds.accession",
      "compounds.name",
      "compounds.chemical_formula",
      "compounds.average_molecular_weight",
      "compounds.monoisotopic_molecular_weight",
      "compounds.iupac_name",
      "compounds.traditional_iupac",
      "compounds.sources_hierarchy",
      "compounds.created_at",
    ])
    .where("compounds.accession", "=", normalizedAccession)
    .executeTakeFirst() as Promise<CompoundDetailRow | undefined>;
}

function baseCompoundNameSearchQuery(db: Kysely<DB>, input: Pick<CompoundNameSearchInput, "query">) {
  const query = input.query.trim();

  return db.selectFrom("compounds").where("compounds.name", "ilike", `%${query}%`);
}

export async function searchCompoundsByName(
  db: Kysely<DB>,
  input: CompoundNameSearchInput
): Promise<CompoundNameSearchRow[]> {
  return applyCompoundNameSearchOrdering(
    baseCompoundNameSearchQuery(db, input).select([
      "compounds.id",
      "compounds.accession",
      "compounds.name",
      "compounds.chemical_formula",
      "compounds.average_molecular_weight",
      "compounds.monoisotopic_molecular_weight",
    ]),
    input
  )
    .limit(input.limit)
    .offset(input.offset)
    .execute() as Promise<CompoundNameSearchRow[]>;
}

export async function countCompoundsByName(
  db: Kysely<DB>,
  input: Pick<CompoundNameSearchInput, "query">
): Promise<number> {
  const row = await baseCompoundNameSearchQuery(db, input)
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  return parseCount(row?.count);
}

export async function listCompoundSourceTermsByAccession(
  db: Kysely<DB>,
  accession: string
): Promise<CompoundSourceTermRow[]> {
  const normalizedAccession = accession.trim().toUpperCase();

  return db
    .selectFrom("compound_sources")
    .innerJoin("compounds", "compounds.id", "compound_sources.compound_id")
    .innerJoin("source_terms as st", "st.id", "compound_sources.source_term_id")
    .leftJoin("source_terms as pst", "pst.id", "compound_sources.parent_source_term_id")
    .select([
      "compound_sources.source_term_id as source_term_id",
      "st.name as source_term_name",
      "compound_sources.parent_source_term_id as parent_source_term_id",
      "pst.name as parent_source_term_name",
      "compound_sources.level",
    ])
    .where("compounds.accession", "=", normalizedAccession)
    .orderBy("compound_sources.level", "asc")
    .orderBy("st.name", "asc")
    .execute() as Promise<CompoundSourceTermRow[]>;
}

function applyCompoundSpectraOrdering<T extends { orderBy: (...args: any[]) => any }>(
  query: T,
  input: Pick<CompoundSpectraListInput, "sortBy" | "sortDirection">,
): T {
  const direction = input.sortDirection;

  if (input.sortBy === "hmdbSpectrumId") {
    return query.orderBy("spectra.hmdb_spectrum_id", direction) as T;
  }

  if (input.sortBy === "polarity") {
    return query
      .orderBy(sql<number>`case when spectra.polarity is null then 1 else 0 end`, "asc")
      .orderBy("spectra.polarity", direction)
      .orderBy("spectra.hmdb_spectrum_id", "asc") as T;
  }

  if (input.sortBy === "collisionEnergyVoltage") {
    return query
      .orderBy(sql<number>`case when spectra.collision_energy_voltage is null then 1 else 0 end`, "asc")
      .orderBy("spectra.collision_energy_voltage", direction)
      .orderBy("spectra.hmdb_spectrum_id", "asc") as T;
  }

  if (input.sortBy === "peakCounter") {
    return query
      .orderBy(sql<number>`case when spectra.peak_counter is null then 1 else 0 end`, "asc")
      .orderBy("spectra.peak_counter", direction)
      .orderBy("spectra.hmdb_spectrum_id", "asc") as T;
  }

  return query
    .orderBy(sql<number>`case when spectra.polarity = 'positive' then 0 else 1 end`, "asc")
    .orderBy(sql<number>`case when spectra.predicted = false then 0 else 1 end`, "asc")
    .orderBy(sql<number>`case when spectra.collision_energy_voltage is null then 1 else 0 end`, "asc")
    .orderBy("spectra.collision_energy_voltage", "asc")
    .orderBy("spectra.hmdb_spectrum_id", "asc") as T;
}

function baseCompoundSpectraQuery(
  db: Kysely<DB>,
  input: Pick<
    CompoundSpectraListInput,
    "accession" | "spectrumKind" | "polarity" | "collisionMin" | "collisionMax"
  >,
) {
  const normalizedAccession = input.accession.trim().toUpperCase();

  let query = db
    .selectFrom("spectra")
    .innerJoin("compounds", "compounds.id", "spectra.compound_id")
    .where("compounds.accession", "=", normalizedAccession);

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

  if (input.collisionMin !== undefined) {
    query = query.where("spectra.collision_energy_voltage", ">=", input.collisionMin);
  }

  if (input.collisionMax !== undefined) {
    query = query.where("spectra.collision_energy_voltage", "<=", input.collisionMax);
  }

  return query;
}

export async function listCompoundSpectraByAccession(
  db: Kysely<DB>,
  input: CompoundSpectraListInput
): Promise<CompoundSpectrumRow[]> {
  return applyCompoundSpectraOrdering(
    baseCompoundSpectraQuery(db, input).select([
      "spectra.id",
      "spectra.compound_id",
      "spectra.hmdb_spectrum_id",
      "spectra.predicted",
      "spectra.ionization_mode",
      "spectra.polarity",
      "spectra.instrument_type",
      "spectra.collision_energy_voltage",
      "spectra.splash_key",
      "spectra.peak_counter",
      "spectra.created_at",
    ]),
    input
  )
    .limit(input.limit)
    .offset(input.offset)
    .execute() as Promise<CompoundSpectrumRow[]>;
}

export async function countCompoundSpectraByAccession(
  db: Kysely<DB>,
  input: Pick<
    CompoundSpectraListInput,
    "accession" | "spectrumKind" | "polarity" | "collisionMin" | "collisionMax"
  >,
): Promise<number> {
  const row = await baseCompoundSpectraQuery(db, input)
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  return parseCount(row?.count);
}

function applyCompoundNameSearchOrdering<T extends { orderBy: (...args: any[]) => any }>(
  query: T,
  input: CompoundNameSearchInput
): T {
  const direction = input.sortDirection;

  if (input.sortBy === "accession") {
    return query.orderBy("compounds.accession", direction).orderBy("compounds.name", "asc") as T;
  }

  if (input.sortBy === "name") {
    return query.orderBy("compounds.name", direction).orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "monoisotopicMolecularWeight") {
    return query
      .orderBy(sql<number>`case when compounds.monoisotopic_molecular_weight is null then 1 else 0 end`, "asc")
      .orderBy("compounds.monoisotopic_molecular_weight", direction)
      .orderBy("compounds.name", "asc")
      .orderBy("compounds.accession", "asc") as T;
  }

  if (input.sortBy === "averageMolecularWeight") {
    return query
      .orderBy(sql<number>`case when compounds.average_molecular_weight is null then 1 else 0 end`, "asc")
      .orderBy("compounds.average_molecular_weight", direction)
      .orderBy("compounds.name", "asc")
      .orderBy("compounds.accession", "asc") as T;
  }

  const searchText = input.query.trim();

  return query
    .orderBy(
      sql<number>`
        case
          when lower(compounds.name) = lower(${searchText}) then 0
          when lower(compounds.name) like lower(${searchText + "%"}) then 1
          else 2
        end
      `,
      "asc"
    )
    .orderBy("compounds.name", "asc")
    .orderBy("compounds.accession", "asc") as T;
}
