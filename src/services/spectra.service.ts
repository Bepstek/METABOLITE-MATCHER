import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import {
  findCandidateSpectraForMsMsSearch,
  findSpectrumByHmdbSpectrumId,
  listSpectrumPeaksBySpectrumId,
  listSpectrumPeaksBySpectrumIds,
  findCompoundIdsByPrecursorAdductMz,
  type MsMsCandidateSpectrumRow,
  type SpectrumPeakRow,
} from "../repositories/spectra.repository";
import { buildPaginationMeta, getOffsetPagination, type PaginationMeta } from "./pagination";
import { msMsSearchSchema, spectrumLookupSchema } from "@/validation/spectra.schemas";

const MSMS_CANDIDATE_LIMIT = 500;
const TOP_MATCHED_PEAK_PAIRS_LIMIT = 20;

type ToleranceUnit = "da" | "ppm";

export type PaginatedResult<T> = {
  rows: T[];
  pagination: PaginationMeta;
};

export type MsMsSpectrumDetailResult = {
  spectrumId: number;
  hmdbSpectrumId: number;
  spectrumType: "Predicted" | "Experimental";
  predicted: boolean;
  ionizationMode: string | null;
  polarity: string | null;
  instrumentType: string | null;
  collisionEnergyVoltage: number | null;
  splashKey: string | null;
  peakCounter: number | null;
  rawMetadata: unknown;
  compound: {
    compoundId: number;
    accession: string;
    name: string;
    chemicalFormula: string | null;
    monoisotopicMolecularWeight: number | null;
    averageMolecularWeight: number | null;
  };
  peaks: Array<{
    mz: number;
    intensity: number;
    rawIntensity: number | null;
    normalizedIntensity: number | null;
    hmdbPeakId: number | null;
    hmdbMsmsId: number | null;
  }>;
};

export type MsMsPrecursorPrefilterSummary = {
  precursorMzApplied: boolean;
  precursorMz: number;
  tolerance: number;
  toleranceUnit: "da" | "ppm";
  adductMode: "unknown" | "selected";
  selectedAdductIds: number[];
  matchedCompoundCount: number;
  matchedAdductCount: number;
  message: string;
};

export type NormalizedQueryPeak = {
  index: number;
  mz: number;
  originalIntensity: number;
  intensity: number;
  toleranceDa: number;
};

export type MatchedPeakPairResult = {
  queryMz: number;
  queryIntensity: number;
  libraryMz: number;
  libraryIntensity: number;
  deltaMz: number;
  deltaPpm: number;
  contribution: number;
};

export type MsMsSearchResult = {
  spectrumId: number;
  hmdbSpectrumId: number;
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  predicted: boolean;
  spectrumType: "Predicted" | "Experimental";
  polarity: string | null;
  ionizationMode: string | null;
  instrumentType: string | null;
  collisionEnergyVoltage: number | null;
  peakCounter: number | null;
  matchedPeaks: number;
  totalQueryPeaks: number;
  totalLibraryPeaks: number;
  cosineScore: number;
  cosinePercent: number;
  cosineNumerator: number;
  queryNorm: number;
  libraryNorm: number;
  matchedPeakPairs: MatchedPeakPairResult[];
};

export type MsMsSearchResponse = PaginatedResult<MsMsSearchResult> & {
  queryPeaks: NormalizedQueryPeak[];
  candidateLimit: number;
  scoredCandidates: number;
  prefilter: MsMsPrecursorPrefilterSummary | null;
};

type LibraryPeak = {
  mz: number;
  intensity: number;
};

type PossiblePeakPair = MatchedPeakPairResult & {
  queryIndex: number;
  libraryIndex: number;
};

function calculateToleranceDa(mz: number, tolerance: number, toleranceUnit: ToleranceUnit) {
  if (toleranceUnit === "ppm") {
    return (mz * tolerance) / 1_000_000;
  }

  return tolerance;
}

function parseAndNormalizePeakList(
  peakList: string,
  tolerance: number,
  toleranceUnit: ToleranceUnit
): NormalizedQueryPeak[] {
  const parsed = peakList
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((entry) => entry.line.length > 0)
    .map((entry) => {
      const parts = entry.line.split(/[,\s]+/).filter(Boolean);

      if (parts.length < 2) {
        throw new Error(`Line ${entry.lineNumber} must start with m/z and intensity values.`);
      }

      const mz = Number(parts[0]);
      const intensity = Number(parts[1]);

      if (!Number.isFinite(mz) || mz <= 0) {
        throw new Error(`Line ${entry.lineNumber} has an invalid m/z value.`);
      }

      if (!Number.isFinite(intensity) || intensity < 0) {
        throw new Error(`Line ${entry.lineNumber} has an invalid intensity value.`);
      }

      return {
        mz,
        originalIntensity: intensity,
      };
    });

  if (parsed.length === 0) {
    throw new Error("Peak list must contain at least one valid peak.");
  }

  const maxIntensity = Math.max(...parsed.map((peak) => peak.originalIntensity));

  if (!Number.isFinite(maxIntensity) || maxIntensity <= 0) {
    throw new Error("Peak list must contain at least one peak with intensity greater than 0.");
  }

  return parsed.map((peak, index) => ({
    index,
    mz: peak.mz,
    originalIntensity: peak.originalIntensity,
    intensity: (peak.originalIntensity / maxIntensity) * 100,
    toleranceDa: calculateToleranceDa(peak.mz, tolerance, toleranceUnit),
  }));
}

function toLibraryPeaks(rows: Array<SpectrumPeakRow & { spectrum_id?: number }>): LibraryPeak[] {
  return rows
    .map((row) => ({
      mz: row.mass_charge,
      intensity: row.normalized_intensity ?? 0,
    }))
    .filter((peak) => peak.mz > 0 && peak.intensity >= 0);
}

function calculateVectorNorm(peaks: Array<{ intensity: number }>) {
  return Math.sqrt(peaks.reduce((sum, peak) => sum + peak.intensity ** 2, 0));
}

function scoreGreedyCosine(queryPeaks: NormalizedQueryPeak[], libraryPeaks: LibraryPeak[]) {
  const possiblePairs: PossiblePeakPair[] = [];

  queryPeaks.forEach((queryPeak, queryIndex) => {
    libraryPeaks.forEach((libraryPeak, libraryIndex) => {
      const deltaMz = libraryPeak.mz - queryPeak.mz;

      if (Math.abs(deltaMz) > queryPeak.toleranceDa) return;

      const contribution = queryPeak.intensity * libraryPeak.intensity;

      possiblePairs.push({
        queryIndex,
        libraryIndex,
        queryMz: queryPeak.mz,
        queryIntensity: queryPeak.intensity,
        libraryMz: libraryPeak.mz,
        libraryIntensity: libraryPeak.intensity,
        deltaMz,
        deltaPpm: (deltaMz / queryPeak.mz) * 1_000_000,
        contribution,
      });
    });
  });

  possiblePairs.sort((left, right) => {
    if (right.contribution !== left.contribution) return right.contribution - left.contribution;
    return Math.abs(left.deltaMz) - Math.abs(right.deltaMz);
  });

  const usedQueryIndexes = new Set<number>();
  const usedLibraryIndexes = new Set<number>();
  const matchedPairs: MatchedPeakPairResult[] = [];

  possiblePairs.forEach((pair) => {
    if (usedQueryIndexes.has(pair.queryIndex) || usedLibraryIndexes.has(pair.libraryIndex)) return;

    usedQueryIndexes.add(pair.queryIndex);
    usedLibraryIndexes.add(pair.libraryIndex);
    matchedPairs.push({
      queryMz: pair.queryMz,
      queryIntensity: pair.queryIntensity,
      libraryMz: pair.libraryMz,
      libraryIntensity: pair.libraryIntensity,
      deltaMz: pair.deltaMz,
      deltaPpm: pair.deltaPpm,
      contribution: pair.contribution,
    });
  });

  const cosineNumerator = matchedPairs.reduce((sum, pair) => sum + pair.contribution, 0);
  const queryNorm = calculateVectorNorm(queryPeaks);
  const libraryNorm = calculateVectorNorm(libraryPeaks);
  const cosineScore = queryNorm > 0 && libraryNorm > 0 ? cosineNumerator / (queryNorm * libraryNorm) : 0;

  return {
    matchedPairs,
    cosineNumerator,
    queryNorm,
    libraryNorm,
    cosineScore,
    cosinePercent: cosineScore * 100,
  };
}

function mapSpectrumDetailPeaks(peaks: SpectrumPeakRow[]) {
  return peaks.map((peak) => ({
    mz: peak.mass_charge,
    intensity: peak.normalized_intensity ?? peak.raw_intensity ?? 0,
    rawIntensity: peak.raw_intensity,
    normalizedIntensity: peak.normalized_intensity,
    hmdbPeakId: peak.hmdb_peak_id,
    hmdbMsmsId: peak.hmdb_msms_id,
  }));
}

function emptyMsMsSearchResponse(input: {
  queryPeaks: NormalizedQueryPeak[];
  page: number;
  limit: number;
  prefilter: MsMsPrecursorPrefilterSummary | null;
}): MsMsSearchResponse {
  return {
    queryPeaks: input.queryPeaks,
    rows: [],
    pagination: buildPaginationMeta({
      page: input.page,
      limit: input.limit,
      totalRows: 0,
    }),
    candidateLimit: MSMS_CANDIDATE_LIMIT,
    scoredCandidates: 0,
    prefilter: input.prefilter,
  };
}

export async function getMsMsSpectrumDetailService(
  db: Kysely<DB>,
  rawInput: unknown
): Promise<MsMsSpectrumDetailResult | undefined> {
  const input = spectrumLookupSchema.parse(rawInput);
  const spectrum = await findSpectrumByHmdbSpectrumId(db, input.hmdbSpectrumId);

  if (!spectrum) return undefined;

  const peaks = await listSpectrumPeaksBySpectrumId(db, spectrum.id);

  return {
    spectrumId: spectrum.id,
    hmdbSpectrumId: spectrum.hmdb_spectrum_id,
    spectrumType: spectrum.predicted ? "Predicted" : "Experimental",
    predicted: spectrum.predicted,
    ionizationMode: spectrum.ionization_mode,
    polarity: spectrum.polarity,
    instrumentType: spectrum.instrument_type,
    collisionEnergyVoltage: spectrum.collision_energy_voltage,
    splashKey: spectrum.splash_key,
    peakCounter: spectrum.peak_counter,
    rawMetadata: spectrum.raw_metadata,
    compound: {
      compoundId: spectrum.compound_id,
      accession: spectrum.accession,
      name: spectrum.name,
      chemicalFormula: spectrum.chemical_formula,
      monoisotopicMolecularWeight: spectrum.monoisotopic_molecular_weight,
      averageMolecularWeight: spectrum.average_molecular_weight,
    },
    peaks: mapSpectrumDetailPeaks(peaks),
  };
}

export async function searchMsMsSpectraService(db: Kysely<DB>, rawInput: unknown): Promise<MsMsSearchResponse> {
  const input = msMsSearchSchema.parse(rawInput);
  const pagination = getOffsetPagination(input);
  const queryPeaks = parseAndNormalizePeakList(input.peakList, input.tolerance, input.toleranceUnit);
  const minMatchedPeaks = Math.min(input.minMatchedPeaks, queryPeaks.length);

  let prefilter: MsMsPrecursorPrefilterSummary | null = null;
  let candidateCompoundIds: number[] | undefined;

  if (input.precursorMz !== undefined) {
    const precursorCandidates = await findCompoundIdsByPrecursorAdductMz(db, {
      precursorMz: input.precursorMz,
      tolerance: input.precursorTolerance,
      toleranceUnit: input.precursorToleranceUnit,
      polarity: input.polarity,
      sourceTermId: input.sourceTermId,
      adductIds: input.polarity === "both" ? [] : input.precursorAdductIds,
    });

    candidateCompoundIds = precursorCandidates.map((candidate) => candidate.compound_id);

    const matchedAdductCount = precursorCandidates.reduce(
      (sum, candidate) => sum + Number(candidate.matched_adduct_count ?? 0),
      0
    );

    const adductMode = input.polarity === "both" || input.precursorAdductIds.length === 0 ? "unknown" : "selected";

    prefilter = {
      precursorMzApplied: true,
      precursorMz: input.precursorMz,
      tolerance: input.precursorTolerance,
      toleranceUnit: input.precursorToleranceUnit,
      adductMode,
      selectedAdductIds: input.polarity === "both" ? [] : input.precursorAdductIds,
      matchedCompoundCount: candidateCompoundIds.length,
      matchedAdductCount,
      message:
        candidateCompoundIds.length === 0
          ? "No compounds matched the precursor/adduct m/z prefilter."
          : `Precursor/adduct m/z prefilter matched ${candidateCompoundIds.length} compound${candidateCompoundIds.length === 1 ? "" : "s"}.`,
    };

    if (candidateCompoundIds.length === 0) {
      return emptyMsMsSearchResponse({
        queryPeaks,
        page: pagination.page,
        limit: pagination.limit,
        prefilter,
      });
    }
  }

  const candidates = await findCandidateSpectraForMsMsSearch(db, {
    queryWindows: queryPeaks.map((peak) => ({
      queryIndex: peak.index,
      lowerMz: peak.mz - peak.toleranceDa,
      upperMz: peak.mz + peak.toleranceDa,
    })),
    spectrumKind: input.spectrumKind,
    polarity: input.polarity,
    candidateCompoundIds,
    sourceTermId: input.sourceTermId,
    minMatchedPeaks,
    candidateLimit: MSMS_CANDIDATE_LIMIT,
  });

  const peaks = await listSpectrumPeaksBySpectrumIds(
    db,
    candidates.map((candidate) => candidate.id)
  );

  const peaksBySpectrumId = new Map<number, Array<SpectrumPeakRow & { spectrum_id: number }>>();

  peaks.forEach((peak) => {
    const current = peaksBySpectrumId.get(peak.spectrum_id) ?? [];
    current.push(peak);
    peaksBySpectrumId.set(peak.spectrum_id, current);
  });

  const scoredRows = candidates
    .map((candidate) => {
      const libraryPeaks = toLibraryPeaks(peaksBySpectrumId.get(candidate.id) ?? []);
      const score = scoreGreedyCosine(queryPeaks, libraryPeaks);
      const topMatchedPeakPairs = [...score.matchedPairs]
        .sort((left, right) => right.contribution - left.contribution)
        .slice(0, TOP_MATCHED_PEAK_PAIRS_LIMIT);

      return {
        spectrumId: candidate.id,
        hmdbSpectrumId: candidate.hmdb_spectrum_id,
        compoundId: candidate.compound_id,
        accession: candidate.accession,
        name: candidate.name,
        chemicalFormula: candidate.chemical_formula,
        predicted: candidate.predicted,
        spectrumType: candidate.predicted ? "Predicted" : ("Experimental" as "Predicted" | "Experimental"),
        polarity: candidate.polarity,
        ionizationMode: candidate.ionization_mode,
        instrumentType: candidate.instrument_type,
        collisionEnergyVoltage: candidate.collision_energy_voltage,
        peakCounter: candidate.peak_counter,
        matchedPeaks: score.matchedPairs.length,
        totalQueryPeaks: queryPeaks.length,
        totalLibraryPeaks: libraryPeaks.length,
        cosineScore: score.cosineScore,
        cosinePercent: score.cosinePercent,
        cosineNumerator: score.cosineNumerator,
        queryNorm: score.queryNorm,
        libraryNorm: score.libraryNorm,
        matchedPeakPairs: topMatchedPeakPairs,
      } satisfies MsMsSearchResult;
    })
    .filter((row) => row.matchedPeaks >= minMatchedPeaks)
    .sort((left, right) => {
      if (right.cosinePercent !== left.cosinePercent) return right.cosinePercent - left.cosinePercent;
      if (right.matchedPeaks !== left.matchedPeaks) return right.matchedPeaks - left.matchedPeaks;
      if (left.name !== right.name) return left.name.localeCompare(right.name);
      return left.hmdbSpectrumId - right.hmdbSpectrumId;
    });

  return {
    queryPeaks,
    rows: scoredRows.slice(pagination.offset, pagination.offset + pagination.limit),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      totalRows: scoredRows.length,
    }),
    candidateLimit: MSMS_CANDIDATE_LIMIT,
    scoredCandidates: scoredRows.length,
    prefilter,
  };
}
