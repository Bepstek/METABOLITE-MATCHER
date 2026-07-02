import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import {
  findExistingTargetAccessions,
  findFragmentCandidatesForMl,
  findPrecursorAdductMatchesForMl,
  listAdductsForMlResolution,
  loadSpectrumPeaksForMl,
  normalizeAdductLabel,
  type MlFragmentCandidateRow,
  type MlPrecursorAdductMatchRow,
} from "../repositories/ml.repository";
import { candidateRankingRequestSchema, type CandidateRankingRequestInput } from "@/validation/ml.schemas";
import {
  buildQuerySpectrumStats,
  calculateCoverageFeatures,
  normalizeQueryPeaks,
  parseMsMsPeakList,
  roundTo,
  scoreLibrarySpectrum,
  topMatchedPeakPairs,
  type MatchedPeakPair,
  type QuerySpectrumStats,
} from "./msms-scoring";

const HMDB_ACCESSION_PATTERN = /^HMDB\d{7}$/;
const TOP_ADDUCT_LIMIT = 5;

export type CandidateRankingWarning = {
  code: string;
  severity: "info" | "warning";
  message: string;
  value?: unknown;
};

export type CandidateRankingResponse = {
  query: CandidateRankingQuerySummary;
  settings: CandidateRankingSettings;
  summary: CandidateRankingSummary;
  warnings: CandidateRankingWarning[];
  candidates?: CandidateRankingRow[];
  trainingRows?: CandidateTrainingRow[];
  querySummaryRow?: QuerySummaryTrainingRow;
  featureMetadata?: CandidateRankingFeatureMetadata;
};

export type CandidateRankingQuerySummary = {
  queryId: string | null;
  queryKey: string | null;
  precursorMz: number;
  rawTargetAccessions: string[];
  normalizedTargetAccessions: string[];
  usableTargetAccessions: string[];
  invalidTargetAccessions: string[];
  missingTargetAccessions: string[];
  querySpectrumStats: QuerySpectrumStats;
  clientMetadata: Record<string, unknown> | null;
};

export type CandidateRankingSettings = {
  precursorTolerance: number;
  precursorToleranceUnit: "da" | "ppm";
  spectrumKind: "experimental" | "predicted" | "both";
  polarity: "positive" | "negative" | "both";
  sourceTermId: number | null;
  minMatchedPeaks: number;
  fragmentCandidateLimit: number;
  returnCandidateLimit: number;
  responseFormat: "nested" | "flat" | "both";
};

export type CandidateRankingSummary = {
  precursorCandidateCompoundCount: number;
  precursorCandidateAdductCount: number;
  fragmentCandidateSpectrumCount: number;
  scoredCandidateCount: number;
  returnedCandidateCount: number;
  fragmentCandidateLimit: number;
  returnCandidateLimit: number;
  wasFragmentCandidateLimitHit: boolean;
  targetCompoundHit: boolean;
  confirmedPositiveSpectrumCount: number;
  confirmedPositiveCompoundCount: number;
  bestTargetCompoundCosineRank: number | null;
  bestTargetCompoundPrecursorMassRank: number | null;
};

export type CandidateRankingFeatureMetadata = {
  modelFeatureColumns: string[];
  featureDirections: Record<string, "higher_is_better" | "lower_is_better" | "rank_ascending">;
};

export type TopMatchedAdduct = {
  adductId: number;
  label: string;
  ionMode: "positive" | "negative";
  theoreticalMz: number;
  massErrorDa: number;
  massErrorPpm: number;
  absoluteMassErrorPpm: number;
};

export type CandidateRankingRow = {
  queryId: string | null;
  queryKey: string | null;
  candidate: {
    compoundId: number;
    accession: string;
    name: string;
    chemicalFormula: string | null;
    spectrumId: number;
    hmdbSpectrumId: number;
    spectrumType: "Experimental" | "Predicted";
    predicted: boolean;
    polarity: string | null;
    ionizationMode: string | null;
    instrumentType: string | null;
    collisionEnergyVoltage: number | null;
  };
  label: {
    value: 1 | 0;
    type: "confirmed_positive" | "weak_negative" | "unlabeled";
    usableTargetAccessions: string[];
    isBestTargetSpectrumByCosine: boolean;
  };
  ranks: {
    cosineRank: number;
    precursorMassRank: number | null;
    combinedInitialRank: number;
  };
  precursorFeatures: {
    precursorMz: number;
    bestAdductId: number | null;
    bestAdductLabel: string | null;
    bestTheoreticalMz: number | null;
    massErrorDa: number | null;
    massErrorPpm: number | null;
    absoluteMassErrorDa: number | null;
    absoluteMassErrorPpm: number | null;
    matchedAdductCount: number;
    topMatchedAdducts: TopMatchedAdduct[];
  };
  spectralFeatures: {
    cosineSimilarity: number;
    cosinePercent: number;
    cosineNumerator: number;
    queryNorm: number;
    libraryNorm: number;
    matchedPeaks: number;
    totalQueryPeaks: number;
    totalLibraryPeaks: number;
    queryCoverage: number;
    libraryCoverage: number;
    balancedCoverage: number;
    topMatchedPeakPairs?: MatchedPeakPair[];
  };
  modelFeatures: {
    cosineSimilarity: number;
    absoluteMassErrorPpm: number | null;
    matchedPeaks: number;
    queryCoverage: number;
    libraryCoverage: number;
    balancedCoverage: number;
    cosineRank: number;
    precursorMassRank: number | null;
  };
};

export type CandidateTrainingRow = Record<string, unknown>;
export type QuerySummaryTrainingRow = Record<string, unknown>;

type TargetProcessingResult = {
  rawTargetAccessions: string[];
  normalizedTargetAccessions: string[];
  usableTargetAccessions: string[];
  invalidTargetAccessions: string[];
  missingTargetAccessions: string[];
};

type ClientMetadataExtract = {
  clientScore: number | null;
  clientFragmentationScore: number | null;
  clientMassErrorPpm: number | null;
  clientIsotopeSimilarity: number | null;
  clientRetentionTimeMinutes: number | null;
  clientCharge: number | null;
  clientFormula: string | null;
  clientDescription: string | null;
  clientAdductLabels: string[];
};

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function getMetadataValue(metadata: Record<string, unknown> | undefined, keys: string[]) {
  if (!metadata) return undefined;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) return metadata[key];
  }

  return undefined;
}

function extractClientMetadata(metadata: Record<string, unknown> | undefined): ClientMetadataExtract {
  return {
    clientScore: numberOrNull(getMetadataValue(metadata, ["score", "Score"])),
    clientFragmentationScore: numberOrNull(getMetadataValue(metadata, ["fragmentationScore", "Fragmentation Score"])),
    clientMassErrorPpm: numberOrNull(getMetadataValue(metadata, ["massErrorPpm", "Mass Error (ppm)"])),
    clientIsotopeSimilarity: numberOrNull(getMetadataValue(metadata, ["isotopeSimilarity", "Isotope Similarity"])),
    clientRetentionTimeMinutes: numberOrNull(getMetadataValue(metadata, ["retentionTimeMinutes", "Retention time (min)"])),
    clientCharge: numberOrNull(getMetadataValue(metadata, ["charge", "Charge"])),
    clientFormula: stringOrNull(getMetadataValue(metadata, ["formula", "Formula"])),
    clientDescription: stringOrNull(getMetadataValue(metadata, ["description", "Description"])),
    clientAdductLabels: splitLabels(getMetadataValue(metadata, ["adductLabels", "Adducts"])),
  };
}

function buildFeatureMetadata(): CandidateRankingFeatureMetadata {
  return {
    modelFeatureColumns: [
      "cosineSimilarity",
      "absoluteMassErrorPpm",
      "matchedPeaks",
      "queryCoverage",
      "libraryCoverage",
      "balancedCoverage",
      "cosineRank",
      "precursorMassRank",
    ],
    featureDirections: {
      cosineSimilarity: "higher_is_better",
      absoluteMassErrorPpm: "lower_is_better",
      matchedPeaks: "higher_is_better",
      queryCoverage: "higher_is_better",
      libraryCoverage: "higher_is_better",
      balancedCoverage: "higher_is_better",
      cosineRank: "rank_ascending",
      precursorMassRank: "rank_ascending",
    },
  };
}

function uniq(values: string[]) {
  return Array.from(new Set(values));
}

async function processTargets(
  db: Kysely<DB>,
  input: CandidateRankingRequestInput,
  warnings: CandidateRankingWarning[],
): Promise<TargetProcessingResult> {
  const rawTargetAccessions = [
    ...(input.targetAccession ? [input.targetAccession] : []),
    ...input.targetAccessions,
  ];

  const normalizedCandidateTargets = uniq(
    rawTargetAccessions.map((value) => value.trim().toUpperCase()).filter(Boolean),
  );

  const normalizedTargetAccessions: string[] = [];
  const invalidTargetAccessions: string[] = [];

  for (const accession of normalizedCandidateTargets) {
    if (HMDB_ACCESSION_PATTERN.test(accession)) {
      normalizedTargetAccessions.push(accession);
    } else {
      invalidTargetAccessions.push(accession);
      warnings.push({
        code: "TARGET_ACCESSION_INVALID_FORMAT",
        severity: "warning",
        message: `Target accession ${accession} does not match the expected HMDB accession format.`,
        value: accession,
      });
    }
  }

  const existing = new Set(await findExistingTargetAccessions(db, normalizedTargetAccessions));
  const usableTargetAccessions = normalizedTargetAccessions.filter((accession) => existing.has(accession));
  const missingTargetAccessions = normalizedTargetAccessions.filter((accession) => !existing.has(accession));

  for (const accession of missingTargetAccessions) {
    warnings.push({
      code: "TARGET_ACCESSION_NOT_FOUND",
      severity: "warning",
      message: `Target accession ${accession} was not found in the local database.`,
      value: accession,
    });
  }

  return {
    rawTargetAccessions,
    normalizedTargetAccessions,
    usableTargetAccessions,
    invalidTargetAccessions,
    missingTargetAccessions,
  };
}

async function resolveAdductIds(
  db: Kysely<DB>,
  input: CandidateRankingRequestInput,
  warnings: CandidateRankingWarning[],
) {
  const directIds = input.polarity === "both" ? [] : input.precursorAdductIds;
  const labels = input.polarity === "both" ? [] : input.precursorAdductLabels.map((label) => label.trim()).filter(Boolean);

  if (labels.length === 0) return Array.from(new Set(directIds));

  const adducts = await listAdductsForMlResolution(db, input.polarity);
  const byExact = new Map(adducts.map((adduct) => [adduct.label, adduct]));
  const byNormalized = new Map(adducts.map((adduct) => [normalizeAdductLabel(adduct.label), adduct]));

  const resolvedIds = [...directIds];

  for (const label of labels) {
    const exact = byExact.get(label);
    if (exact) {
      resolvedIds.push(exact.id);
      continue;
    }

    const normalized = normalizeAdductLabel(label);
    const normalizedMatch = byNormalized.get(normalized);

    if (normalizedMatch) {
      resolvedIds.push(normalizedMatch.id);
      warnings.push({
        code: "ADDUCT_LABEL_NORMALIZED",
        severity: "info",
        message: `Adduct label ${label} was normalized to ${normalizedMatch.label}.`,
        value: label,
      });
      continue;
    }

    warnings.push({
      code: "ADDUCT_LABEL_NOT_FOUND",
      severity: "warning",
      message: `Adduct label ${label} was not found and was ignored. Candidate generation may fall back to Unknown / all enabled adducts.`,
      value: label,
    });
  }

  return Array.from(new Set(resolvedIds));
}

function groupPrecursorMatches(matches: MlPrecursorAdductMatchRow[]) {
  const grouped = new Map<number, MlPrecursorAdductMatchRow[]>();

  for (const match of matches) {
    const current = grouped.get(match.compound_id) ?? [];
    current.push(match);
    grouped.set(match.compound_id, current);
  }

  for (const rows of grouped.values()) {
    rows.sort(
      (left, right) =>
        Number(left.absolute_mass_error_ppm) - Number(right.absolute_mass_error_ppm) ||
        String(left.adduct_label).localeCompare(String(right.adduct_label)),
    );
  }

  return grouped;
}

function computePrecursorMassRanks(grouped: Map<number, MlPrecursorAdductMatchRow[]>) {
  const bestRows = Array.from(grouped.entries()).map(([compoundId, rows]) => ({
    compoundId,
    best: rows[0],
    rankKey: roundTo(Number(rows[0]?.absolute_mass_error_ppm ?? Number.POSITIVE_INFINITY), 6),
  }));

  bestRows.sort((left, right) => left.rankKey - right.rankKey || left.compoundId - right.compoundId);

  const ranks = new Map<number, number>();
  let currentRank = 0;
  let previousKey: number | null = null;

  for (const row of bestRows) {
    if (previousKey === null || row.rankKey !== previousKey) {
      currentRank += 1;
      previousKey = row.rankKey;
    }
    ranks.set(row.compoundId, currentRank);
  }

  return ranks;
}

function buildTopMatchedAdducts(rows: MlPrecursorAdductMatchRow[]): TopMatchedAdduct[] {
  return rows.slice(0, TOP_ADDUCT_LIMIT).map((row) => ({
    adductId: row.adduct_id,
    label: row.adduct_label,
    ionMode: row.ion_mode,
    theoreticalMz: Number(row.theoretical_mz),
    massErrorDa: Number(row.mass_error_da),
    massErrorPpm: Number(row.mass_error_ppm),
    absoluteMassErrorPpm: Number(row.absolute_mass_error_ppm),
  }));
}

function emptySummary(input: CandidateRankingRequestInput): CandidateRankingSummary {
  return {
    precursorCandidateCompoundCount: 0,
    precursorCandidateAdductCount: 0,
    fragmentCandidateSpectrumCount: 0,
    scoredCandidateCount: 0,
    returnedCandidateCount: 0,
    fragmentCandidateLimit: input.fragmentCandidateLimit,
    returnCandidateLimit: input.returnCandidateLimit,
    wasFragmentCandidateLimitHit: false,
    targetCompoundHit: false,
    confirmedPositiveSpectrumCount: 0,
    confirmedPositiveCompoundCount: 0,
    bestTargetCompoundCosineRank: null,
    bestTargetCompoundPrecursorMassRank: null,
  };
}

function buildBaseResponse(input: CandidateRankingRequestInput, querySpectrumStats: QuerySpectrumStats, targets: TargetProcessingResult, warnings: CandidateRankingWarning[]): CandidateRankingResponse {
  return {
    query: {
      queryId: input.queryId ?? null,
      queryKey: input.queryKey ?? null,
      precursorMz: input.precursorMz,
      ...targets,
      querySpectrumStats,
      clientMetadata: input.clientMetadata ?? null,
    },
    settings: {
      precursorTolerance: input.precursorTolerance,
      precursorToleranceUnit: input.precursorToleranceUnit,
      spectrumKind: input.spectrumKind,
      polarity: input.polarity,
      sourceTermId: input.sourceTermId ?? null,
      minMatchedPeaks: input.minMatchedPeaks,
      fragmentCandidateLimit: input.fragmentCandidateLimit,
      returnCandidateLimit: input.returnCandidateLimit,
      responseFormat: input.responseFormat,
    },
    summary: emptySummary(input),
    warnings,
  };
}

function buildTrainingRow(
  row: CandidateRankingRow,
  input: CandidateRankingRequestInput,
  client: ClientMetadataExtract,
  warnings: CandidateRankingWarning[],
): CandidateTrainingRow {
  const clientComputedMassErrorDeltaPpm =
    client.clientMassErrorPpm != null && row.precursorFeatures.massErrorPpm != null
      ? row.precursorFeatures.massErrorPpm - client.clientMassErrorPpm
      : null;

  const clientComputedAbsoluteMassErrorDeltaPpm =
    client.clientMassErrorPpm != null && row.precursorFeatures.massErrorPpm != null
      ? Math.abs(Math.abs(row.precursorFeatures.massErrorPpm) - Math.abs(client.clientMassErrorPpm))
      : null;

  return {
    queryId: row.queryId,
    queryKey: row.queryKey,
    precursorMz: row.precursorFeatures.precursorMz,
    candidateAccession: row.candidate.accession,
    candidateName: row.candidate.name,
    compoundId: row.candidate.compoundId,
    spectrumId: row.candidate.spectrumId,
    hmdbSpectrumId: row.candidate.hmdbSpectrumId,
    spectrumType: row.candidate.spectrumType,
    polarity: row.candidate.polarity,
    label: row.label.value,
    labelType: row.label.type,
    usableTargetAccessions: row.label.usableTargetAccessions.join(";"),
    isBestTargetSpectrumByCosine: row.label.isBestTargetSpectrumByCosine,
    cosineSimilarity: row.modelFeatures.cosineSimilarity,
    absoluteMassErrorPpm: row.modelFeatures.absoluteMassErrorPpm,
    matchedPeaks: row.modelFeatures.matchedPeaks,
    queryCoverage: row.modelFeatures.queryCoverage,
    libraryCoverage: row.modelFeatures.libraryCoverage,
    balancedCoverage: row.modelFeatures.balancedCoverage,
    cosineRank: row.modelFeatures.cosineRank,
    precursorMassRank: row.modelFeatures.precursorMassRank,
    bestAdductLabel: row.precursorFeatures.bestAdductLabel,
    bestTheoreticalMz: row.precursorFeatures.bestTheoreticalMz,
    massErrorDa: row.precursorFeatures.massErrorDa,
    massErrorPpm: row.precursorFeatures.massErrorPpm,
    cosinePercent: row.spectralFeatures.cosinePercent,
    totalQueryPeaks: row.spectralFeatures.totalQueryPeaks,
    totalLibraryPeaks: row.spectralFeatures.totalLibraryPeaks,
    clientScore: client.clientScore,
    clientFragmentationScore: client.clientFragmentationScore,
    clientMassErrorPpm: client.clientMassErrorPpm,
    clientComputedMassErrorDeltaPpm,
    clientComputedAbsoluteMassErrorDeltaPpm,
    clientIsotopeSimilarity: client.clientIsotopeSimilarity,
    clientRetentionTimeMinutes: client.clientRetentionTimeMinutes,
    clientCharge: client.clientCharge,
    clientFormula: client.clientFormula,
    clientDescription: client.clientDescription,
    clientAdductLabels: client.clientAdductLabels.join(";"),
    ...(input.includeWarningsInFlatRows ? { warningsJson: JSON.stringify(warnings) } : {}),
    ...(input.includeClientMetadataInFlatRows ? { clientMetadataJson: JSON.stringify(input.clientMetadata ?? {}) } : {}),
  };
}

function buildQuerySummaryRow(
  response: CandidateRankingResponse,
  input: CandidateRankingRequestInput,
  warnings: CandidateRankingWarning[],
): QuerySummaryTrainingRow {
  return {
    queryId: response.query.queryId,
    queryKey: response.query.queryKey,
    precursorMz: response.query.precursorMz,
    rawTargetAccessions: response.query.rawTargetAccessions.join(";"),
    normalizedTargetAccessions: response.query.normalizedTargetAccessions.join(";"),
    usableTargetAccessions: response.query.usableTargetAccessions.join(";"),
    invalidTargetAccessions: response.query.invalidTargetAccessions.join(";"),
    missingTargetAccessions: response.query.missingTargetAccessions.join(";"),
    totalQueryPeaks: response.query.querySpectrumStats.totalQueryPeaks,
    minMz: response.query.querySpectrumStats.minMz,
    maxMz: response.query.querySpectrumStats.maxMz,
    basePeakMz: response.query.querySpectrumStats.basePeakMz,
    maxOriginalIntensity: response.query.querySpectrumStats.maxOriginalIntensity,
    totalNormalizedIntensity: response.query.querySpectrumStats.totalNormalizedIntensity,
    meanNormalizedIntensity: response.query.querySpectrumStats.meanNormalizedIntensity,
    ...response.summary,
    warningCodes: warnings.map((warning) => warning.code).join(";"),
    ...(input.includeWarningsInFlatRows ? { warningsJson: JSON.stringify(warnings) } : {}),
  };
}

function finalizeResponse(
  response: CandidateRankingResponse,
  input: CandidateRankingRequestInput,
  candidateRows: CandidateRankingRow[],
  warnings: CandidateRankingWarning[],
): CandidateRankingResponse {
  if (input.responseFormat === "nested" || input.responseFormat === "both") {
    response.candidates = candidateRows;
  }

  if (input.responseFormat === "flat" || input.responseFormat === "both") {
    const client = extractClientMetadata(input.clientMetadata);
    response.trainingRows = candidateRows.map((row) => buildTrainingRow(row, input, client, warnings));
    response.querySummaryRow = buildQuerySummaryRow(response, input, warnings);
  }

  if (input.includeFeatureMetadata) {
    response.featureMetadata = buildFeatureMetadata();
  }

  return response;
}

export async function generateMsMsCandidateRankingService(
  db: Kysely<DB>,
  rawInput: unknown,
): Promise<CandidateRankingResponse> {
  const input = candidateRankingRequestSchema.parse(rawInput);
  const warnings: CandidateRankingWarning[] = [];

  const parsedPeaks = parseMsMsPeakList(input.peakList);
  const queryPeaks = normalizeQueryPeaks(parsedPeaks, 0.1, "da");
  // Fragment candidate windows for candidate ranking use the same default fragment tolerance semantics
  // as the current baseline web example unless a future schema adds explicit fragment tolerance inputs.
  const querySpectrumStats = buildQuerySpectrumStats(queryPeaks);

  const targets = await processTargets(db, input, warnings);
  const response = buildBaseResponse(input, querySpectrumStats, targets, warnings);

  const resolvedAdductIds = await resolveAdductIds(db, input, warnings);

  const precursorMatches = await findPrecursorAdductMatchesForMl(db, {
    precursorMz: input.precursorMz,
    tolerance: input.precursorTolerance,
    toleranceUnit: input.precursorToleranceUnit,
    polarity: input.polarity,
    adductIds: resolvedAdductIds,
    sourceTermId: input.sourceTermId,
  });

  if (precursorMatches.length === 0) {
    warnings.push({
      code: "NO_PRECURSOR_CANDIDATES",
      severity: "warning",
      message: "No compounds matched the precursor/adduct m/z prefilter.",
    });
    return finalizeResponse(response, input, [], warnings);
  }

  const groupedPrecursorMatches = groupPrecursorMatches(precursorMatches);
  const candidateCompoundIds = Array.from(groupedPrecursorMatches.keys());
  const precursorMassRanks = computePrecursorMassRanks(groupedPrecursorMatches);

  response.summary.precursorCandidateCompoundCount = candidateCompoundIds.length;
  response.summary.precursorCandidateAdductCount = precursorMatches.length;

  const queryWindows = queryPeaks.map((peak) => ({
    queryIndex: peak.index,
    lowerMz: peak.mz - peak.toleranceDa,
    upperMz: peak.mz + peak.toleranceDa,
  }));

  const fragmentCandidates = await findFragmentCandidatesForMl(db, {
    queryWindows,
    spectrumKind: input.spectrumKind,
    polarity: input.polarity,
    candidateCompoundIds,
    sourceTermId: input.sourceTermId,
    minMatchedPeaks: input.minMatchedPeaks,
    fragmentCandidateLimit: input.fragmentCandidateLimit,
  });

  response.summary.fragmentCandidateSpectrumCount = fragmentCandidates.length;
  response.summary.wasFragmentCandidateLimitHit = fragmentCandidates.length >= input.fragmentCandidateLimit;

  if (response.summary.wasFragmentCandidateLimitHit) {
    warnings.push({
      code: "FRAGMENT_CANDIDATE_LIMIT_HIT",
      severity: "warning",
      message: "Fragment candidate retrieval reached the requested fragmentCandidateLimit.",
      value: input.fragmentCandidateLimit,
    });
  }

  if (fragmentCandidates.length === 0) {
    warnings.push({
      code: "NO_FRAGMENT_CANDIDATES",
      severity: "warning",
      message: "No spectrum candidates passed the fragment matching threshold after precursor filtering.",
    });
    return finalizeResponse(response, input, [], warnings);
  }

  const peaks = await loadSpectrumPeaksForMl(db, fragmentCandidates.map((candidate) => candidate.spectrum_id));
  const peaksBySpectrumId = new Map<number, typeof peaks>();

  for (const peak of peaks) {
    const current = peaksBySpectrumId.get(peak.spectrum_id) ?? [];
    current.push(peak);
    peaksBySpectrumId.set(peak.spectrum_id, current);
  }

  const scoredRows = fragmentCandidates.map((candidate) => {
    const libraryPeaks = (peaksBySpectrumId.get(candidate.spectrum_id) ?? []).map((peak) => ({
      mz: Number(peak.mz),
      intensity: Number(peak.intensity ?? 0),
      normalizedIntensity: peak.normalized_intensity,
      rawIntensity: peak.raw_intensity,
      hmdbPeakId: peak.hmdb_peak_id,
      hmdbMsmsId: peak.hmdb_msms_id,
    }));

    const score = scoreLibrarySpectrum(queryPeaks, libraryPeaks);
    const coverage = calculateCoverageFeatures(score.matchedPeaks, score.totalQueryPeaks, score.totalLibraryPeaks);

    return { candidate, score, coverage };
  });

  scoredRows.sort((left, right) => {
    const cosineDiff = right.score.cosinePercent - left.score.cosinePercent;
    if (cosineDiff !== 0) return cosineDiff;
    const matchedDiff = right.score.matchedPeaks - left.score.matchedPeaks;
    if (matchedDiff !== 0) return matchedDiff;
    const nameDiff = left.candidate.name.localeCompare(right.candidate.name);
    if (nameDiff !== 0) return nameDiff;
    return left.candidate.hmdb_spectrum_id - right.candidate.hmdb_spectrum_id;
  });

  response.summary.scoredCandidateCount = scoredRows.length;

  const returnedRows = scoredRows.slice(0, input.returnCandidateLimit);
  response.summary.returnedCandidateCount = returnedRows.length;

  const usableTargetSet = new Set(targets.usableTargetAccessions);
  const bestTargetSpectrumRankByAccession = new Map<string, number>();

  returnedRows.forEach((row, index) => {
    const cosineRank = index + 1;
    if (usableTargetSet.has(row.candidate.accession)) {
      const current = bestTargetSpectrumRankByAccession.get(row.candidate.accession);
      if (current === undefined || cosineRank < current) {
        bestTargetSpectrumRankByAccession.set(row.candidate.accession, cosineRank);
      }
    }
  });

  const candidateRows: CandidateRankingRow[] = returnedRows.map((scored, index) => {
    const candidate = scored.candidate;
    const cosineRank = index + 1;
    const precursorRows = groupedPrecursorMatches.get(candidate.compound_id) ?? [];
    const bestAdduct = precursorRows[0];
    const precursorMassRank = precursorMassRanks.get(candidate.compound_id) ?? null;
    const isPositive = usableTargetSet.has(candidate.accession);
    const labelType = targets.usableTargetAccessions.length === 0 ? "unlabeled" : isPositive ? "confirmed_positive" : "weak_negative";

    return {
      queryId: input.queryId ?? null,
      queryKey: input.queryKey ?? null,
      candidate: {
        compoundId: candidate.compound_id,
        accession: candidate.accession,
        name: candidate.name,
        chemicalFormula: candidate.chemical_formula,
        spectrumId: candidate.spectrum_id,
        hmdbSpectrumId: candidate.hmdb_spectrum_id,
        spectrumType: candidate.predicted ? "Predicted" : "Experimental",
        predicted: candidate.predicted,
        polarity: candidate.polarity,
        ionizationMode: candidate.ionization_mode,
        instrumentType: candidate.instrument_type,
        collisionEnergyVoltage: candidate.collision_energy_voltage,
      },
      label: {
        value: isPositive ? 1 : 0,
        type: labelType,
        usableTargetAccessions: targets.usableTargetAccessions,
        isBestTargetSpectrumByCosine:
          isPositive && bestTargetSpectrumRankByAccession.get(candidate.accession) === cosineRank,
      },
      ranks: {
        cosineRank,
        precursorMassRank,
        combinedInitialRank: cosineRank,
      },
      precursorFeatures: {
        precursorMz: input.precursorMz,
        bestAdductId: bestAdduct?.adduct_id ?? null,
        bestAdductLabel: bestAdduct?.adduct_label ?? null,
        bestTheoreticalMz: bestAdduct?.theoretical_mz == null ? null : Number(bestAdduct.theoretical_mz),
        massErrorDa: bestAdduct?.mass_error_da == null ? null : Number(bestAdduct.mass_error_da),
        massErrorPpm: bestAdduct?.mass_error_ppm == null ? null : Number(bestAdduct.mass_error_ppm),
        absoluteMassErrorDa: bestAdduct?.absolute_mass_error_da == null ? null : Number(bestAdduct.absolute_mass_error_da),
        absoluteMassErrorPpm: bestAdduct?.absolute_mass_error_ppm == null ? null : Number(bestAdduct.absolute_mass_error_ppm),
        matchedAdductCount: precursorRows.length,
        topMatchedAdducts: buildTopMatchedAdducts(precursorRows),
      },
      spectralFeatures: {
        cosineSimilarity: scored.score.cosineScore,
        cosinePercent: scored.score.cosinePercent,
        cosineNumerator: scored.score.cosineNumerator,
        queryNorm: scored.score.queryNorm,
        libraryNorm: scored.score.libraryNorm,
        matchedPeaks: scored.score.matchedPeaks,
        totalQueryPeaks: scored.score.totalQueryPeaks,
        totalLibraryPeaks: scored.score.totalLibraryPeaks,
        queryCoverage: scored.coverage.queryCoverage,
        libraryCoverage: scored.coverage.libraryCoverage,
        balancedCoverage: scored.coverage.balancedCoverage,
        ...(input.includeMatchedPeakPairs ? { topMatchedPeakPairs: topMatchedPeakPairs(scored.score.matchedPeakPairs, 20) } : {}),
      },
      modelFeatures: {
        cosineSimilarity: scored.score.cosineScore,
        absoluteMassErrorPpm: bestAdduct?.absolute_mass_error_ppm == null ? null : Number(bestAdduct.absolute_mass_error_ppm),
        matchedPeaks: scored.score.matchedPeaks,
        queryCoverage: scored.coverage.queryCoverage,
        libraryCoverage: scored.coverage.libraryCoverage,
        balancedCoverage: scored.coverage.balancedCoverage,
        cosineRank,
        precursorMassRank,
      },
    };
  });

  const positiveRows = candidateRows.filter((row) => row.label.type === "confirmed_positive");
  const positiveCompoundAccessions = new Set(positiveRows.map((row) => row.candidate.accession));

  response.summary.targetCompoundHit = positiveRows.length > 0;
  response.summary.confirmedPositiveSpectrumCount = positiveRows.length;
  response.summary.confirmedPositiveCompoundCount = positiveCompoundAccessions.size;
  response.summary.bestTargetCompoundCosineRank =
    positiveRows.length > 0 ? Math.min(...positiveRows.map((row) => row.ranks.cosineRank)) : null;
  response.summary.bestTargetCompoundPrecursorMassRank =
    positiveRows.length > 0
      ? Math.min(...positiveRows.map((row) => row.ranks.precursorMassRank ?? Number.POSITIVE_INFINITY))
      : null;

  if (targets.usableTargetAccessions.length > 0 && positiveRows.length === 0) {
    warnings.push({
      code: "TARGET_ACCESSION_NOT_RETURNED",
      severity: "warning",
      message: "No returned candidate spectrum belonged to the usable target compound accessions.",
      value: targets.usableTargetAccessions,
    });
  }

  return finalizeResponse(response, input, candidateRows, warnings);
}
