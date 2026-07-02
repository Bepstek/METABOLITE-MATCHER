import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import {
  countCompoundsByName,
  countCompoundSpectraByAccession,
  listCompoundSpectraByAccession,
  searchCompoundsByName,
  findCompoundByAccession,
  listCompoundSourceTermsByAccession,
} from "../repositories/compounds.repository";
import {
  countAdductMz,
  countFragmentMass,
  countNeutralMass,
  searchAdductMz,
  searchFragmentMass,
  searchNeutralMass,
  listCompoundAdductsByAccession,
} from "../repositories/search.repository";
import {
  adductMzSearchSchema,
  compoundNameSearchSchema,
  compoundSpectraListSchema,
  fragmentMassSearchSchema,
  neutralMassSearchSchema,
  compoundAccessionLookupSchema,
  metadataAdductsSchema,
  sourceTermsMetadataSchema,
} from "../validation/search.schemas";
import { buildPaginationMeta, getOffsetPagination, type PaginationMeta } from "./pagination";
import { calculateMassError, calculateSearchWindow } from "./tolerance";
import { listEnabledAdductsByIonMode, listSourceTerms } from "../repositories/metadata.repository";

export type PaginatedResult<T> = {
  rows: T[];
  pagination: PaginationMeta;
};

export type CompoundNameSearchResult = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  averageMolecularWeight: number | null;
  monoisotopicMolecularWeight: number | null;
};

export type NeutralMassSearchResult = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  monoisotopicMolecularWeight: number;
  averageMolecularWeight: number | null;
  massErrorDa: number;
  massErrorPpm: number;
};

export type AdductMzSearchResult = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  monoisotopicMolecularWeight: number | null;
  averageMolecularWeight: number | null;
  adductId: number;
  adductLabel: string;
  ionMode: "positive" | "negative";
  theoreticalMz: number;
  massErrorDa: number;
  massErrorPpm: number;
};

export type CompoundAdductSummaryResult = {
  adductId: number;
  label: string;
  ionMode: "positive" | "negative";
  charge: number;
  massMultiplier: number;
  massShift: number;
  theoreticalMz: number;
  enabled: boolean;
};

export type FragmentMassSearchResult = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  spectrumId: number;
  hmdbSpectrumId: number;
  predicted: boolean;
  ionizationMode: string | null;
  polarity: string | null;
  instrumentType: string | null;
  collisionEnergyVoltage: number | null;
  peakId: string | number;
  hmdbPeakId: number | null;
  hmdbMsmsId: number | null;
  massCharge: number;
  rawIntensity: number | null;
  normalizedIntensity: number | null;
  massErrorDa: number;
  massErrorPpm: number;
};

export type CompoundSpectrumListResult = {
  spectrumId: number;
  compoundId: number;
  hmdbSpectrumId: number;
  predicted: boolean;
  ionizationMode: string | null;
  polarity: string | null;
  instrumentType: string | null;
  collisionEnergyVoltage: number | null;
  splashKey: string | null;
  peakCounter: number | null;
  createdAt: Date | string;
};

export async function searchCompoundsByNameService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<PaginatedResult<CompoundNameSearchResult>> {
  const input = compoundNameSearchSchema.parse(rawInput);
  const pagination = getOffsetPagination(input);

  const [rows, totalRows] = await Promise.all([
    searchCompoundsByName(db, {
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countCompoundsByName(db, { query: input.query }),
  ]);

  return {
    rows: rows.map((row) => ({
      compoundId: row.id,
      accession: row.accession,
      name: row.name,
      chemicalFormula: row.chemical_formula,
      averageMolecularWeight: row.average_molecular_weight,
      monoisotopicMolecularWeight: row.monoisotopic_molecular_weight,
    })),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      totalRows,
    }),
  };
}

export async function listCompoundAdductsService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<CompoundAdductSummaryResult[]> {
  const input = compoundAccessionLookupSchema.parse(rawInput);
  const rows = await listCompoundAdductsByAccession(db, input.accession);

  return rows.map((row) => ({
    adductId: row.adduct_id,
    label: row.adduct_label,
    ionMode: row.ion_mode,
    charge: row.charge,
    massMultiplier: row.mass_multiplier,
    massShift: row.mass_shift,
    theoreticalMz: row.theoretical_mz,
    enabled: row.enabled,
  }));
}

export async function searchNeutralMassService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<PaginatedResult<NeutralMassSearchResult>> {
  const input = neutralMassSearchSchema.parse(rawInput);
  const pagination = getOffsetPagination(input);
  const window = calculateSearchWindow({
    queryValue: input.queryMass,
    tolerance: input.tolerance,
    toleranceUnit: input.toleranceUnit,
  });

  const repoInput = {
    queryMass: input.queryMass,
    lowerMass: window.lower,
    upperMass: window.upper,
    toleranceUnit: input.toleranceUnit,
    sourceTermId: input.sourceTermId,
  };

  const [rows, totalRows] = await Promise.all([
    searchNeutralMass(db, {
      ...repoInput,
      limit: pagination.limit,
      offset: pagination.offset,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
    }),
    countNeutralMass(db, { ...repoInput, sortBy: input.sortBy, sortDirection: input.sortDirection }),
  ]);

  return {
    rows: rows.map((row) => {
      const error = calculateMassError(row.monoisotopic_molecular_weight, input.queryMass);

      return {
        compoundId: row.compound_id,
        accession: row.accession,
        name: row.name,
        chemicalFormula: row.chemical_formula,
        monoisotopicMolecularWeight: row.monoisotopic_molecular_weight,
        averageMolecularWeight: row.average_molecular_weight,
        ...error,
      };
    }),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      totalRows,
    }),
  };
}

export async function searchAdductMzService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<PaginatedResult<AdductMzSearchResult>> {
  const input = adductMzSearchSchema.parse(rawInput);
  const pagination = getOffsetPagination(input);
  const window = calculateSearchWindow({
    queryValue: input.queryMz,
    tolerance: input.tolerance,
    toleranceUnit: input.toleranceUnit,
  });

  const repoInput = {
    queryMz: input.queryMz,
    lowerMz: window.lower,
    upperMz: window.upper,
    ionMode: input.ionMode,
    adductIds: input.adductIds,
    sourceTermId: input.sourceTermId,
  };

  const [rows, totalRows] = await Promise.all([
    searchAdductMz(db, {
      ...repoInput,
      limit: pagination.limit,
      offset: pagination.offset,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
    }),
    countAdductMz(db, {
      ...repoInput,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
    }),
  ]);

  return {
    rows: rows.map((row) => {
      const error = calculateMassError(row.theoretical_mz, input.queryMz);

      return {
        compoundId: row.compound_id,
        accession: row.accession,
        name: row.name,
        chemicalFormula: row.chemical_formula,
        monoisotopicMolecularWeight: row.monoisotopic_molecular_weight,
        averageMolecularWeight: row.average_molecular_weight,
        adductId: row.adduct_id,
        adductLabel: row.adduct_label,
        ionMode: row.ion_mode,
        theoreticalMz: row.theoretical_mz,
        ...error,
      };
    }),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      totalRows,
    }),
  };
}

/**
 * Primitive fragment peak m/z lookup service.
 *
 * This is intentionally NOT cosine similarity, NOT spectral similarity scoring,
 * and NOT final LC-MS/MS identification logic.
 */
export async function searchFragmentMassService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<PaginatedResult<FragmentMassSearchResult>> {
  const input = fragmentMassSearchSchema.parse(rawInput);
  const pagination = getOffsetPagination(input);
  const window = calculateSearchWindow({
    queryValue: input.queryMz,
    tolerance: input.tolerance,
    toleranceUnit: input.toleranceUnit,
  });

  const repoInput = {
    queryMz: input.queryMz,
    lowerMz: window.lower,
    upperMz: window.upper,
    spectrumKind: input.spectrumKind,
    polarity: input.polarity,
    minNormalizedIntensity: input.minNormalizedIntensity,
    sourceTermId: input.sourceTermId,
  };

  const [rows, totalRows] = await Promise.all([
    searchFragmentMass(db, {
      ...repoInput,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countFragmentMass(db, repoInput),
  ]);

  return {
    rows: rows.map((row) => {
      const error = calculateMassError(row.mass_charge, input.queryMz);

      return {
        compoundId: row.compound_id,
        accession: row.accession,
        name: row.name,
        chemicalFormula: row.chemical_formula,
        spectrumId: row.spectrum_id,
        hmdbSpectrumId: row.hmdb_spectrum_id,
        predicted: row.predicted,
        ionizationMode: row.ionization_mode,
        polarity: row.polarity,
        instrumentType: row.instrument_type,
        collisionEnergyVoltage: row.collision_energy_voltage,
        peakId: row.peak_id,
        hmdbPeakId: row.hmdb_peak_id,
        hmdbMsmsId: row.hmdb_msms_id,
        massCharge: row.mass_charge,
        rawIntensity: row.raw_intensity,
        normalizedIntensity: row.normalized_intensity,
        ...error,
      };
    }),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      totalRows,
    }),
  };
}

export async function listCompoundSpectraService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<PaginatedResult<CompoundSpectrumListResult>> {
  const input = compoundSpectraListSchema.parse(rawInput);
  const pagination = getOffsetPagination(input);

  const repoInput = {
    accession: input.accession,
    spectrumKind: input.spectrumKind,
    polarity: input.polarity,
    collisionMin: input.collisionMin,
    collisionMax: input.collisionMax,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };

  const [rows, totalRows] = await Promise.all([
    listCompoundSpectraByAccession(db, {
      ...repoInput,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countCompoundSpectraByAccession(db, repoInput),
  ]);

  return {
    rows: rows.map((row) => ({
      spectrumId: row.id,
      compoundId: row.compound_id,
      hmdbSpectrumId: row.hmdb_spectrum_id,
      predicted: row.predicted,
      ionizationMode: row.ionization_mode,
      polarity: row.polarity,
      instrumentType: row.instrument_type,
      collisionEnergyVoltage: row.collision_energy_voltage,
      splashKey: row.splash_key,
      peakCounter: row.peak_counter,
      createdAt: row.created_at,
    })),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      totalRows,
    }),
  };
}

export type CompoundDetailResult = {
  compound: {
    compoundId: number;
    accession: string;
    name: string;
    chemicalFormula: string | null;
    averageMolecularWeight: number | null;
    monoisotopicMolecularWeight: number | null;
    iupacName: string | null;
    traditionalIupac: string | null;
    sourcesHierarchy: unknown;
    createdAt: Date | string;
  };
  sourceTerms: Array<{
    sourceTermId: number;
    sourceTermName: string;
    parentSourceTermId: number | null;
    parentSourceTermName: string | null;
    level: number;
  }>;
};

export type EnabledAdductOptionResult = {
  id: number;
  label: string;
  ionMode: "positive" | "negative";
  charge: number;
  massMultiplier: number;
  massShift: number;
};

export type SourceTermOptionResult = {
  id: number;
  name: string;
};

export async function getCompoundByAccessionService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<CompoundDetailResult | undefined> {
  const input = compoundAccessionLookupSchema.parse(rawInput);
  const compound = await findCompoundByAccession(db, input.accession);

  if (!compound) {
    return undefined;
  }

  const sourceTerms = await listCompoundSourceTermsByAccession(db, compound.accession);

  return {
    compound: {
      compoundId: compound.id,
      accession: compound.accession,
      name: compound.name,
      chemicalFormula: compound.chemical_formula,
      averageMolecularWeight: compound.average_molecular_weight,
      monoisotopicMolecularWeight: compound.monoisotopic_molecular_weight,
      iupacName: compound.iupac_name,
      traditionalIupac: compound.traditional_iupac,
      sourcesHierarchy: compound.sources_hierarchy,
      createdAt: compound.created_at,
    },
    sourceTerms: sourceTerms.map((row) => ({
      sourceTermId: row.source_term_id,
      sourceTermName: row.source_term_name,
      parentSourceTermId: row.parent_source_term_id,
      parentSourceTermName: row.parent_source_term_name,
      level: row.level,
    })),
  };
}

export async function listEnabledAdductsByIonModeService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<EnabledAdductOptionResult[]> {
  const input = metadataAdductsSchema.parse(rawInput);
  const rows = await listEnabledAdductsByIonMode(db, input.ionMode);

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    ionMode: row.ion_mode,
    charge: row.charge,
    massMultiplier: row.mass_multiplier,
    massShift: row.mass_shift,
  }));
}

export async function listSourceTermsService(db: Kysely<DB>, rawInput: unknown): Promise<SourceTermOptionResult[]> {
  const input = sourceTermsMetadataSchema.parse(rawInput);
  const rows = await listSourceTerms(db, { maxLevel: input.maxLevel });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
  }));
}
