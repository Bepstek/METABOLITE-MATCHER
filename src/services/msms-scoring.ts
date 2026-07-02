export type ToleranceUnit = "da" | "ppm";

export type ParsedQueryPeak = {
  index: number;
  mz: number;
  originalIntensity: number;
};

export type NormalizedQueryPeak = ParsedQueryPeak & {
  intensity: number;
  toleranceDa: number;
};

export type LibraryPeak = {
  mz: number;
  intensity: number;
  normalizedIntensity?: number | null;
  rawIntensity?: number | null;
  hmdbPeakId?: number | null;
  hmdbMsmsId?: number | null;
};

export type MatchedPeakPair = {
  queryMz: number;
  queryIntensity: number;
  libraryMz: number;
  libraryIntensity: number;
  deltaMz: number;
  deltaPpm: number;
  contribution: number;
};

export type CosineScoreResult = {
  cosineScore: number;
  cosinePercent: number;
  cosineNumerator: number;
  queryNorm: number;
  libraryNorm: number;
  matchedPeaks: number;
  totalQueryPeaks: number;
  totalLibraryPeaks: number;
  matchedPeakPairs: MatchedPeakPair[];
};

export type QuerySpectrumStats = {
  totalQueryPeaks: number;
  minMz: number;
  maxMz: number;
  basePeakMz: number;
  maxOriginalIntensity: number;
  totalNormalizedIntensity: number;
  meanNormalizedIntensity: number;
};

export type CoverageFeatures = {
  queryCoverage: number;
  libraryCoverage: number;
  balancedCoverage: number;
};

export function toleranceToDa(mz: number, tolerance: number, toleranceUnit: ToleranceUnit) {
  return toleranceUnit === "ppm" ? (mz * tolerance) / 1_000_000 : tolerance;
}

export function parseMsMsPeakList(peakList: string): ParsedQueryPeak[] {
  const peaks: ParsedQueryPeak[] = [];
  const errors: string[] = [];

  peakList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line, lineIndex) => {
      if (!line) return;

      const tokens = line.split(/[\s,]+/).filter(Boolean);
      if (tokens.length < 2) {
        errors.push(`Line ${lineIndex + 1}: expected at least two numeric columns`);
        return;
      }

      const mz = Number(tokens[0]);
      const intensity = Number(tokens[1]);

      if (!Number.isFinite(mz) || mz <= 0) {
        errors.push(`Line ${lineIndex + 1}: invalid m/z value`);
        return;
      }

      if (!Number.isFinite(intensity) || intensity < 0) {
        errors.push(`Line ${lineIndex + 1}: invalid intensity value`);
        return;
      }

      peaks.push({ index: peaks.length, mz, originalIntensity: intensity });
    });

  if (errors.length > 0) {
    throw new Error(errors.slice(0, 5).join("; "));
  }

  if (peaks.length === 0) {
    throw new Error("Peak list must contain at least one valid peak");
  }

  if (!peaks.some((peak) => peak.originalIntensity > 0)) {
    throw new Error("Peak list must contain at least one peak with intensity greater than 0");
  }

  return peaks;
}

export function normalizeQueryPeaks(
  peaks: ParsedQueryPeak[],
  tolerance: number,
  toleranceUnit: ToleranceUnit,
): NormalizedQueryPeak[] {
  const maxIntensity = Math.max(...peaks.map((peak) => peak.originalIntensity));

  return peaks.map((peak) => ({
    ...peak,
    intensity: maxIntensity > 0 ? (peak.originalIntensity / maxIntensity) * 100 : 0,
    toleranceDa: toleranceToDa(peak.mz, tolerance, toleranceUnit),
  }));
}

export function buildQuerySpectrumStats(queryPeaks: NormalizedQueryPeak[]): QuerySpectrumStats {
  const totalQueryPeaks = queryPeaks.length;
  const mzValues = queryPeaks.map((peak) => peak.mz);
  const basePeak = [...queryPeaks].sort((left, right) => right.originalIntensity - left.originalIntensity)[0];
  const totalNormalizedIntensity = queryPeaks.reduce((sum, peak) => sum + peak.intensity, 0);

  return {
    totalQueryPeaks,
    minMz: Math.min(...mzValues),
    maxMz: Math.max(...mzValues),
    basePeakMz: basePeak?.mz ?? 0,
    maxOriginalIntensity: Math.max(...queryPeaks.map((peak) => peak.originalIntensity)),
    totalNormalizedIntensity,
    meanNormalizedIntensity: totalQueryPeaks > 0 ? totalNormalizedIntensity / totalQueryPeaks : 0,
  };
}

export function calculateCoverageFeatures(
  matchedPeaks: number,
  totalQueryPeaks: number,
  totalLibraryPeaks: number,
): CoverageFeatures {
  return {
    queryCoverage: totalQueryPeaks > 0 ? matchedPeaks / totalQueryPeaks : 0,
    libraryCoverage: totalLibraryPeaks > 0 ? matchedPeaks / totalLibraryPeaks : 0,
    balancedCoverage:
      totalQueryPeaks > 0 && totalLibraryPeaks > 0
        ? matchedPeaks / Math.sqrt(totalQueryPeaks * totalLibraryPeaks)
        : 0,
  };
}

function intensityForLibraryPeak(peak: LibraryPeak) {
  const value = peak.normalizedIntensity ?? peak.intensity ?? 0;
  return Number.isFinite(value) ? value : 0;
}

export function scoreLibrarySpectrum(
  queryPeaks: NormalizedQueryPeak[],
  libraryPeaks: LibraryPeak[],
): CosineScoreResult {
  const possiblePairs: MatchedPeakPair[] = [];

  for (const queryPeak of queryPeaks) {
    for (const libraryPeak of libraryPeaks) {
      const libraryIntensity = intensityForLibraryPeak(libraryPeak);
      const deltaMz = libraryPeak.mz - queryPeak.mz;
      const absDeltaMz = Math.abs(deltaMz);

      if (absDeltaMz > queryPeak.toleranceDa) continue;

      possiblePairs.push({
        queryMz: queryPeak.mz,
        queryIntensity: queryPeak.intensity,
        libraryMz: libraryPeak.mz,
        libraryIntensity,
        deltaMz,
        deltaPpm: queryPeak.mz > 0 ? (deltaMz / queryPeak.mz) * 1_000_000 : 0,
        contribution: queryPeak.intensity * libraryIntensity,
      });
    }
  }

  possiblePairs.sort((left, right) => {
    const contributionDiff = right.contribution - left.contribution;
    if (contributionDiff !== 0) return contributionDiff;
    return Math.abs(left.deltaMz) - Math.abs(right.deltaMz);
  });

  const usedQueryMz = new Set<string>();
  const usedLibraryMz = new Set<string>();
  const matchedPeakPairs: MatchedPeakPair[] = [];

  for (const pair of possiblePairs) {
    const queryKey = pair.queryMz.toFixed(6);
    const libraryKey = pair.libraryMz.toFixed(6);

    if (usedQueryMz.has(queryKey) || usedLibraryMz.has(libraryKey)) continue;

    usedQueryMz.add(queryKey);
    usedLibraryMz.add(libraryKey);
    matchedPeakPairs.push(pair);
  }

  const cosineNumerator = matchedPeakPairs.reduce((sum, pair) => sum + pair.contribution, 0);
  const queryNorm = Math.sqrt(queryPeaks.reduce((sum, peak) => sum + peak.intensity ** 2, 0));
  const libraryNorm = Math.sqrt(libraryPeaks.reduce((sum, peak) => sum + intensityForLibraryPeak(peak) ** 2, 0));
  const cosineScore = queryNorm > 0 && libraryNorm > 0 ? cosineNumerator / (queryNorm * libraryNorm) : 0;

  return {
    cosineScore,
    cosinePercent: cosineScore * 100,
    cosineNumerator,
    queryNorm,
    libraryNorm,
    matchedPeaks: matchedPeakPairs.length,
    totalQueryPeaks: queryPeaks.length,
    totalLibraryPeaks: libraryPeaks.length,
    matchedPeakPairs,
  };
}

export function topMatchedPeakPairs(pairs: MatchedPeakPair[], limit = 20) {
  return [...pairs]
    .sort((left, right) => right.contribution - left.contribution || Math.abs(left.deltaMz) - Math.abs(right.deltaMz))
    .slice(0, limit);
}

export function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
