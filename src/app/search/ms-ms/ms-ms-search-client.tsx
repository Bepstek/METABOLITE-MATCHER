"use client";

import Link from "next/link";
import type { SyntheticEvent } from "react";
import { useEffect, useState } from "react";
import { ChemicalFormula } from "../../../components/chemical-formula";
import { PaginationControls } from "../../../components/pagination-controls";
import { SectionPanel } from "../../../components/section-panel";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { buildErrorMessage, fetchJson } from "../../../lib/api-client";
import { formatNullableNumber, formatNullableText } from "../../../lib/format";

type ToleranceUnit = "ppm" | "da";
type SpectrumKind = "experimental" | "predicted" | "both";
type MsMsPolarity = "positive" | "negative" | "both";
type LimitOption = 10 | 25 | 50 | 100;

const LIMIT_OPTIONS = [10, 25, 50, 100] as const;
const GRAPH_MIN_INTENSITY_OPTIONS = [0, 0.5, 1, 2, 5, 10] as const;
type GraphMinIntensityOption = (typeof GRAPH_MIN_INTENSITY_OPTIONS)[number];

const DEFAULT_GRAPH_MIN_INTENSITY: GraphMinIntensityOption = 1;
const HMDB_BASE_URL = process.env.NEXT_PUBLIC_HMDB_BASE_URL ?? "https://hmdb.ca";

type SourceTermOption = { id: number; name: string };

type PaginationMeta = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type QueryPeak = {
  index: number;
  mz: number;
  originalIntensity: number;
  intensity: number;
  toleranceDa: number;
};

type MatchedPeakPair = {
  queryMz: number;
  queryIntensity: number;
  libraryMz: number;
  libraryIntensity: number;
  deltaMz: number;
  deltaPpm: number;
  contribution: number;
};

type MsMsSearchRow = {
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
  matchedPeakPairs: MatchedPeakPair[];
  mlProbability?: number;
  mlRank?: number;
};

type MsMsSearchResponse = {
  queryPeaks: QueryPeak[];
  rows: MsMsSearchRow[];
  pagination: PaginationMeta;
  candidateLimit: number;
  scoredCandidates: number;
  prefilter: MsMsPrecursorPrefilterSummary | null;
};

type MsMsPrecursorPrefilterSummary = {
  precursorMzApplied: boolean;
  precursorMz: number;
  tolerance: number;
  toleranceUnit: ToleranceUnit;
  adductMode: "unknown" | "selected";
  selectedAdductIds: number[];
  matchedCompoundCount: number;
  matchedAdductCount: number;
  message: string;
};

type SpectrumPeak = {
  mz: number;
  intensity: number;
  normalizedIntensity: number | null;
  rawIntensity: number | null;
  hmdbPeakId: number | null;
  hmdbMsmsId: number | null;
};

type SpectrumDetail = {
  hmdbSpectrumId: number;
  peaks: SpectrumPeak[];
};

type DisplayQueryPeak = QueryPeak & {
  matched: boolean;
};

type DisplayLibraryPeak = SpectrumPeak & {
  displayIntensity: number;
  matched: boolean;
};

type HoveredMirrorPeak = {
  x: number;
  y: number;
  label1: string;
  label2: string;
};

type AdductOption = {
  id: number;
  label: string;
};

const GRAPH_WIDTH = 900;
const GRAPH_HEIGHT = 360;
const GRAPH_PADDING = { top: 24, right: 28, bottom: 52, left: 76 };

function isLimitOption(value: number): value is LimitOption {
  return LIMIT_OPTIONS.includes(value as LimitOption);
}

function isGraphMinIntensityOption(value: number): value is GraphMinIntensityOption {
  return (GRAPH_MIN_INTENSITY_OPTIONS as readonly number[]).includes(value);
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value)) return 1;
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(value)), totalPages);
}

function formatPeakNumber(value: number, digits = 4) {
  if (!Number.isFinite(value)) return "—";

  const formatted = value.toFixed(digits);
  if (!formatted.includes(".")) return formatted;

  return formatted.replace(/0+$/, "").replace(/\.$/, "");
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function niceCeil(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0) return step;
  return Math.ceil(value / step) * step;
}

function buildHmdbSpectrumUrl(hmdbSpectrumId: number | string | null | undefined) {
  if (hmdbSpectrumId === null || hmdbSpectrumId === undefined) return null;
  return `${HMDB_BASE_URL.replace(/\/$/, "")}/spectra/ms_ms/${encodeURIComponent(String(hmdbSpectrumId))}`;
}

function buildLcMsAdductSearchUrl(input: {
  precursorMz: number;
  ionMode: "positive" | "negative";
  tolerance: number;
  toleranceUnit: ToleranceUnit;
  selectedAdductIds: number[];
  sourceTermId: string;
  limit: LimitOption;
}) {
  const params = new URLSearchParams({
    queryMzValues: String(input.precursorMz),
    ionMode: input.ionMode,
    tolerance: String(input.tolerance),
    toleranceUnit: input.toleranceUnit,
    limit: String(input.limit),
  });

  if (input.selectedAdductIds.length > 0) {
    params.set("adductIds", input.selectedAdductIds.join(","));
  }

  if (input.sourceTermId !== "any") {
    params.set("sourceTermId", input.sourceTermId);
  }

  return `/search/adduct-mz?${params.toString()}`;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, `Request failed with status ${response.status}`));
  }

  return payload as T;
}

function getMirrorPeakKey(mz: number) {
  return mz.toFixed(4);
}

function getTopMzForDisplay(
  queryPeaks: DisplayQueryPeak[],
  libraryPeaks: DisplayLibraryPeak[],
  matchedPairs: MatchedPeakPair[]
) {
  const visibleMzValues = [
    ...queryPeaks.map((peak) => peak.mz),
    ...libraryPeaks.map((peak) => peak.mz),
    ...matchedPairs.map((pair) => pair.queryMz),
    ...matchedPairs.map((pair) => pair.libraryMz),
  ].filter((value) => Number.isFinite(value) && value >= 0);

  if (visibleMzValues.length === 0) return 10;

  const maxVisibleMz = Math.max(...visibleMzValues);

  if (maxVisibleMz <= 50) return niceCeil(maxVisibleMz, 10);
  if (maxVisibleMz <= 500) return niceCeil(maxVisibleMz, 50);
  return niceCeil(maxVisibleMz, 100);
}

function MirrorSpectrumGraph({
  queryPeaks,
  libraryPeaks,
  matchedPairs,
  minIntensity,
}: {
  queryPeaks: QueryPeak[];
  libraryPeaks: SpectrumPeak[];
  matchedPairs: MatchedPeakPair[];
  minIntensity: GraphMinIntensityOption;
}) {
  const [hoveredPeak, setHoveredPeak] = useState<HoveredMirrorPeak | null>(null);

  const matchedQueryKeys = new Set(matchedPairs.map((pair) => getMirrorPeakKey(pair.queryMz)));
  const matchedLibraryKeys = new Set(matchedPairs.map((pair) => getMirrorPeakKey(pair.libraryMz)));

  const displayedQueryPeaks: DisplayQueryPeak[] = queryPeaks
    .map((peak) => ({ ...peak, matched: matchedQueryKeys.has(getMirrorPeakKey(peak.mz)) }))
    .filter((peak) => peak.intensity >= minIntensity || peak.matched);

  const displayedLibraryPeaks: DisplayLibraryPeak[] = libraryPeaks
    .map((peak) => ({
      ...peak,
      displayIntensity: peak.normalizedIntensity ?? peak.intensity ?? 0,
      matched: matchedLibraryKeys.has(getMirrorPeakKey(peak.mz)),
    }))
    .filter((peak) => peak.displayIntensity >= minIntensity || peak.matched);

  if (queryPeaks.length === 0 || libraryPeaks.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border bg-slate-50 text-sm text-slate-500">
        Select a result to load the mirror spectrum comparison.
      </div>
    );
  }

  if (displayedQueryPeaks.length === 0 && displayedLibraryPeaks.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border bg-slate-50 text-sm text-slate-500">
        No peaks remain after the display intensity filter. Lower the graph display filter.
      </div>
    );
  }

  const minMz = 0;
  const maxMz = getTopMzForDisplay(displayedQueryPeaks, displayedLibraryPeaks, matchedPairs);
  const xRange = maxMz - minMz || 1;

  const maxIntensity = 100;
  const plotWidth = GRAPH_WIDTH - GRAPH_PADDING.left - GRAPH_PADDING.right;
  const plotHeight = GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom;
  const baselineY = GRAPH_PADDING.top + plotHeight / 2;
  const halfHeight = plotHeight / 2 - 12;

  const xForMz = (mz: number) => GRAPH_PADDING.left + ((mz - minMz) / xRange) * plotWidth;
  const yForQuery = (intensity: number) => baselineY - (intensity / maxIntensity) * halfHeight;
  const yForLibrary = (intensity: number) => baselineY + (intensity / maxIntensity) * halfHeight;

  const xTicks = Array.from({ length: 6 }, (_, index) => minMz + (xRange * index) / 5);
  const yTicks = [100, 50, 0, -50, -100];

  return (
    <div className="relative overflow-x-auto rounded-md border bg-white p-3">
      <div className="mb-2 flex flex-col gap-1 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>Display filter: showing peaks ≥ {minIntensity}% intensity; matched peaks are always shown.</span>
        <span>
          Query {displayedQueryPeaks.length}/{queryPeaks.length} · Library {displayedLibraryPeaks.length}/
          {libraryPeaks.length}
        </span>
      </div>

      <svg
        role="img"
        aria-label="LC-MS/MS mirror spectrum comparison"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        className="h-auto min-w-190 max-w-full"
        onMouseLeave={() => setHoveredPeak(null)}
      >
        {xTicks.map((tick) => {
          const x = xForMz(tick);
          return (
            <line
              key={`x-grid-${tick}`}
              x1={x}
              y1={GRAPH_PADDING.top}
              x2={x}
              y2={GRAPH_PADDING.top + plotHeight}
              stroke="currentColor"
              className="text-slate-300"
              strokeWidth="1"
              strokeDasharray="1 2"
            />
          );
        })}

        {yTicks.map((tick) => {
          const y = tick >= 0 ? yForQuery(tick) : yForLibrary(Math.abs(tick));
          return (
            <line
              key={`y-grid-${tick}`}
              x1={GRAPH_PADDING.left}
              y1={y}
              x2={GRAPH_PADDING.left + plotWidth}
              y2={y}
              stroke="currentColor"
              className={tick === 0 ? "text-slate-500" : "text-slate-200"}
              strokeWidth={tick === 0 ? "1" : "1"}
              strokeDasharray={tick === 0 ? undefined : "1 2"}
            />
          );
        })}

        {yTicks.map((tick) => {
          const y = tick >= 0 ? yForQuery(tick) : yForLibrary(Math.abs(tick));

          return (
            <g key={`y-label-${tick}`}>
              <line
                x1={GRAPH_PADDING.left - 5}
                y1={y}
                x2={GRAPH_PADDING.left}
                y2={y}
                stroke="currentColor"
                className="text-slate-400"
              />
              <text x={GRAPH_PADDING.left - 10} y={y + 4} textAnchor="end" className="fill-slate-600 text-[11px]">
                {tick}
              </text>
            </g>
          );
        })}

        <text
          x={20}
          y={GRAPH_PADDING.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 20 ${GRAPH_PADDING.top + plotHeight / 2})`}
          className="fill-slate-700 text-[13px] font-medium"
        >
          Relative Intensity
        </text>

        <line
          x1={GRAPH_PADDING.left}
          y1={GRAPH_PADDING.top}
          x2={GRAPH_PADDING.left}
          y2={GRAPH_PADDING.top + plotHeight}
          stroke="currentColor"
          className="text-slate-500"
          strokeWidth="1"
        />

        {matchedPairs.map((pair, index) => {
          const queryVisible = displayedQueryPeaks.some(
            (peak) => getMirrorPeakKey(peak.mz) === getMirrorPeakKey(pair.queryMz)
          );
          const libraryVisible = displayedLibraryPeaks.some(
            (peak) => getMirrorPeakKey(peak.mz) === getMirrorPeakKey(pair.libraryMz)
          );
          if (!queryVisible || !libraryVisible) return null;

          return (
            <line
              key={`${pair.queryMz}-${pair.libraryMz}-${index}`}
              x1={xForMz(pair.queryMz)}
              y1={yForQuery(pair.queryIntensity)}
              x2={xForMz(pair.libraryMz)}
              y2={yForLibrary(pair.libraryIntensity)}
              stroke="currentColor"
              className="text-slate-400"
              strokeWidth="1"
              opacity="0.45"
            />
          );
        })}

        {displayedQueryPeaks.map((peak, index) => {
          const x = xForMz(peak.mz);
          const y = yForQuery(peak.intensity);
          return (
            <g key={`q-${peak.mz}-${index}`}>
              <line
                x1={x}
                y1={baselineY}
                x2={x}
                y2={y}
                stroke="currentColor"
                className={peak.matched ? "text-blue-700" : "text-sky-500"}
                strokeWidth={peak.matched ? "3" : "1.5"}
              />
              <line
                x1={x}
                y1={GRAPH_PADDING.top}
                x2={x}
                y2={baselineY}
                stroke="transparent"
                strokeWidth="14"
                className="cursor-crosshair"
                onMouseEnter={() =>
                  setHoveredPeak({
                    x,
                    y,
                    label1: `Query m/z: ${formatPeakNumber(peak.mz)}`,
                    label2: `Normalized: ${formatPeakNumber(peak.intensity, 2)} · Original: ${formatPeakNumber(peak.originalIntensity, 2)}`,
                  })
                }
                onMouseMove={() =>
                  setHoveredPeak({
                    x,
                    y,
                    label1: `Query m/z: ${formatPeakNumber(peak.mz)}`,
                    label2: `Normalized: ${formatPeakNumber(peak.intensity, 2)} · Original: ${formatPeakNumber(peak.originalIntensity, 2)}`,
                  })
                }
              />
            </g>
          );
        })}

        {displayedLibraryPeaks.map((peak, index) => {
          const x = xForMz(peak.mz);
          const y = yForLibrary(peak.displayIntensity);
          return (
            <g key={`l-${peak.mz}-${index}`}>
              <line
                x1={x}
                y1={baselineY}
                x2={x}
                y2={y}
                stroke="currentColor"
                className={peak.matched ? "text-red-700" : "text-rose-500"}
                strokeWidth={peak.matched ? "3" : "1.5"}
              />
              <line
                x1={x}
                y1={baselineY}
                x2={x}
                y2={GRAPH_PADDING.top + plotHeight}
                stroke="transparent"
                strokeWidth="14"
                className="cursor-crosshair"
                onMouseEnter={() =>
                  setHoveredPeak({
                    x,
                    y,
                    label1: `Library m/z: ${formatPeakNumber(peak.mz)}`,
                    label2: `Intensity: ${formatPeakNumber(peak.displayIntensity, 2)}`,
                  })
                }
                onMouseMove={() =>
                  setHoveredPeak({
                    x,
                    y,
                    label1: `Library m/z: ${formatPeakNumber(peak.mz)}`,
                    label2: `Intensity: ${formatPeakNumber(peak.displayIntensity, 2)}`,
                  })
                }
              />
            </g>
          );
        })}

        {hoveredPeak ? (
          <g pointerEvents="none">
            <line
              x1={hoveredPeak.x}
              y1={GRAPH_PADDING.top}
              x2={hoveredPeak.x}
              y2={GRAPH_PADDING.top + plotHeight}
              stroke="currentColor"
              className="text-slate-400"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <rect
              x={Math.min(hoveredPeak.x + 10, GRAPH_WIDTH - 238)}
              y={Math.max(Math.min(hoveredPeak.y - 54, GRAPH_HEIGHT - 104), GRAPH_PADDING.top)}
              width="228"
              height="46"
              rx="6"
              className="fill-slate-900"
              opacity="0.92"
            />
            <text
              x={Math.min(hoveredPeak.x + 22, GRAPH_WIDTH - 226)}
              y={Math.max(Math.min(hoveredPeak.y - 30, GRAPH_HEIGHT - 80), GRAPH_PADDING.top + 24)}
              className="fill-white text-[12px] font-medium"
            >
              {hoveredPeak.label1}
            </text>
            <text
              x={Math.min(hoveredPeak.x + 22, GRAPH_WIDTH - 226)}
              y={Math.max(Math.min(hoveredPeak.y - 13, GRAPH_HEIGHT - 63), GRAPH_PADDING.top + 41)}
              className="fill-white text-[12px]"
            >
              {hoveredPeak.label2}
            </text>
          </g>
        ) : null}

        {xTicks.map((tick) => {
          const x = xForMz(tick);
          return (
            <g key={`x-${tick}`}>
              <line x1={x} y1={baselineY} x2={x} y2={baselineY + 5} stroke="currentColor" className="text-slate-400" />
              <text x={x} y={GRAPH_HEIGHT - 20} textAnchor="middle" className="fill-slate-600 text-[11px]">
                {formatPeakNumber(tick, 0)}
              </text>
            </g>
          );
        })}

        <text
          x={GRAPH_PADDING.left + plotWidth / 2}
          y={GRAPH_HEIGHT - 6}
          textAnchor="middle"
          className="fill-slate-700 text-[13px] font-medium"
        >
          m/z
        </text>
        <text x={GRAPH_PADDING.left + 8} y={GRAPH_PADDING.top + 16} className="fill-blue-700 text-[13px] font-medium">
          Query
        </text>
        <text
          x={GRAPH_PADDING.left + 8}
          y={GRAPH_PADDING.top + plotHeight - 8}
          className="fill-red-700 text-[13px] font-medium"
        >
          Library
        </text>
      </svg>
    </div>
  );
}

const TOUR_STEPS = [
  {
    targetId: "msms-peak-list",
    title: "MS/MS Peak List",
    description: "Paste your raw fragment peaks here. The format should be one peak per line containing m/z and intensity (separated by space, tab, or comma). Only the first two numeric columns are used."
  },
  {
    targetId: "tour-tolerance",
    title: "Fragment Tolerance",
    description: "Specify the tolerance window (in Da or ppm) used to match your query peaks against database library peaks."
  },
  {
    targetId: "tour-spectrum-kind",
    title: "Spectrum Kind",
    description: "Filter library candidates by experimental spectra (from actual lab samples), predicted spectra (theoretically modeled), or search against both."
  },
  {
    targetId: "tour-precursor-toggle",
    title: "Precursor Filter Toggle",
    description: "Expand optional precursor m/z prefiltering. Supplying precursor m/z narrows candidates significantly using computed adduct masses."
  },
  {
    targetId: "tour-ml-ranking",
    title: "ML Re-ranking Option",
    description: "Toggle our query-level trained Random Forest model. It combines cosine similarity, ppm mass error, and fragment coverage to place the correct compound match at rank #1."
  }
];

export function MsMsSearchClient() {
  const [peakListDraft, setPeakListDraft] = useState("");
  const [toleranceDraft, setToleranceDraft] = useState("0.1");
  const [toleranceUnitDraft, setToleranceUnitDraft] = useState<ToleranceUnit>("da");
  const [spectrumKindDraft, setSpectrumKindDraft] = useState<SpectrumKind>("experimental");
  const [polarityDraft, setPolarityDraft] = useState<MsMsPolarity>("positive");
  const [sourceTermIdDraft, setSourceTermIdDraft] = useState("any");
  const [minMatchedPeaksDraft, setMinMatchedPeaksDraft] = useState("3");
  const [limitDraft, setLimitDraft] = useState<LimitOption>(10);
  const [graphMinIntensity, setGraphMinIntensity] = useState<GraphMinIntensityOption>(DEFAULT_GRAPH_MIN_INTENSITY);

  const [result, setResult] = useState<MsMsSearchResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<MsMsSearchRow | null>(null);
  const [selectedSpectrumDetail, setSelectedSpectrumDetail] = useState<SpectrumDetail | null>(null);
  const [isSpectrumLoading, setIsSpectrumLoading] = useState(false);
  const [sourceTerms, setSourceTerms] = useState<SourceTermOption[]>([]);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [showPrecursorFilter, setShowPrecursorFilter] = useState(false);
  const [precursorMzDraft, setPrecursorMzDraft] = useState("");
  const [precursorToleranceDraft, setPrecursorToleranceDraft] = useState("5");
  const [precursorToleranceUnitDraft, setPrecursorToleranceUnitDraft] = useState<ToleranceUnit>("ppm");
  const [precursorAdductIdsDraft, setPrecursorAdductIdsDraft] = useState<number[]>([]);
  const [adductOptions, setAdductOptions] = useState<AdductOption[]>([]);
  const [adductMetadataError, setAdductMetadataError] = useState<string | null>(null);
  const [useMlRanking, setUseMlRanking] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);

  useEffect(() => {
    if (tourStep === 4) {
      setShowPrecursorFilter(true);
    }
  }, [tourStep]);

  useEffect(() => {
    if (tourStep === null) return;

    const step = TOUR_STEPS[tourStep];
    const element = document.getElementById(step.targetId);
    if (!element) return;

    // Apply high visibility styles
    element.classList.add("relative", "z-[70]", "ring-4", "ring-cyan-500", "bg-white", "shadow-2xl", "p-1.5", "rounded-md");
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    return () => {
      element.classList.remove("relative", "z-[70]", "ring-4", "ring-cyan-500", "bg-white", "shadow-2xl", "p-1.5", "rounded-md");
    };
  }, [tourStep]);

  useEffect(() => {
    setPrecursorAdductIdsDraft([]);

    if (polarityDraft === "both") {
      setAdductOptions([]);
      setAdductMetadataError(null);
      return;
    }

    const abortController = new AbortController();

    async function loadAdducts() {
      setAdductMetadataError(null);

      try {
        const adducts = await fetchJson<AdductOption[]>(
          `/api/metadata/adducts?ionMode=${polarityDraft}`,
          abortController.signal
        );
        setAdductOptions(adducts);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAdductOptions([]);
        setAdductMetadataError(error instanceof Error ? error.message : "Failed to load adduct metadata");
      }
    }

    loadAdducts();

    return () => abortController.abort();
  }, [polarityDraft]);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadMetadata() {
      setMetadataError(null);
      try {
        const sources = await fetchJson<SourceTermOption[]>("/api/metadata/source-terms", abortController.signal);
        setSourceTerms(sources);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMetadataError(error instanceof Error ? error.message : "Failed to load metadata");
      }
    }

    loadMetadata();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    if (!result || result.rows.length === 0) {
      setSelectedResult(null);
      return;
    }
    setSelectedResult(result.rows[0]);
  }, [result]);

  useEffect(() => {
    if (!selectedResult) {
      setSelectedSpectrumDetail(null);
      return;
    }

    const abortController = new AbortController();

    async function loadSelectedSpectrum() {
      setIsSpectrumLoading(true);
      try {
        const detail = await fetchJson<SpectrumDetail>(
          `/api/spectra/ms-ms/${selectedResult?.hmdbSpectrumId}`,
          abortController.signal
        );
        setSelectedSpectrumDetail(detail);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSelectedSpectrumDetail(null);
      } finally {
        if (!abortController.signal.aborted) setIsSpectrumLoading(false);
      }
    }

    loadSelectedSpectrum();
    return () => abortController.abort();
  }, [selectedResult]);

  async function runSearch(nextPage: number) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const trimmedPrecursorMz = precursorMzDraft.trim();
      const data = await postJson<MsMsSearchResponse>("/api/search/ms-ms", {
        peakList: peakListDraft,
        tolerance: toleranceDraft,
        toleranceUnit: toleranceUnitDraft,
        spectrumKind: spectrumKindDraft,
        polarity: polarityDraft,
        precursorMz: trimmedPrecursorMz ? trimmedPrecursorMz : undefined,
        precursorTolerance: precursorToleranceDraft,
        precursorToleranceUnit: precursorToleranceUnitDraft,
        precursorAdductIds: polarityDraft === "both" ? [] : precursorAdductIdsDraft,
        sourceTermId: sourceTermIdDraft === "any" ? undefined : Number(sourceTermIdDraft),
        minMatchedPeaks: minMatchedPeaksDraft,
        useMlRanking,
        page: nextPage,
        limit: limitDraft,
      });

      setResult(data);
      setPage(data.pagination.page);
      setPageInput(String(data.pagination.page));
    } catch (error) {
      setResult(null);
      setErrorMessage(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }

  function togglePrecursorAdduct(adductId: number) {
    setPrecursorAdductIdsDraft((current) =>
      current.includes(adductId) ? current.filter((id) => id !== adductId) : [...current, adductId]
    );
  }

  function handleSearchSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setPageInput("1");
    runSearch(1);
  }

  function resetSearch() {
    setPeakListDraft("");
    setToleranceDraft("0.1");
    setToleranceUnitDraft("da");
    setSpectrumKindDraft("experimental");
    setPolarityDraft("positive");
    setSourceTermIdDraft("any");
    setMinMatchedPeaksDraft("3");
    setLimitDraft(10);
    setGraphMinIntensity(DEFAULT_GRAPH_MIN_INTENSITY);
    setShowPrecursorFilter(false);
    clearPrecursorFilter();
    setUseMlRanking(false);
    setResult(null);
    setSelectedResult(null);
    setSelectedSpectrumDetail(null);
    setErrorMessage(null);
    setPage(1);
    setPageInput("1");
  }

  function clearPrecursorFilter() {
    setPrecursorMzDraft("");
    setPrecursorToleranceDraft("5");
    setPrecursorToleranceUnitDraft("ppm");
    setPrecursorAdductIdsDraft([]);
  }

  function loadExample() {
    setPeakListDraft("109.2 3.407\n124.2 47.4946\n124.5 3.0944\n170.16 100\n170.52 13.2397");
    setToleranceDraft("0.1");
    setToleranceUnitDraft("da");
    setSpectrumKindDraft("experimental");
    setPolarityDraft("positive");
    setSourceTermIdDraft("any");
    setMinMatchedPeaksDraft("3");
    setLimitDraft(10);
    setShowPrecursorFilter(false);
    clearPrecursorFilter();
  }

  async function runMlExample() {
    setTourStep(null);
    setPeakListDraft("90.05 10.0\n132.08 100.0\n115.05 30.0");
    setPrecursorMzDraft("132.0768");
    setPrecursorToleranceDraft("5");
    setPrecursorToleranceUnitDraft("ppm");
    setUseMlRanking(true);
    setShowPrecursorFilter(true);

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await postJson<MsMsSearchResponse>("/api/search/ms-ms", {
        peakList: "90.05 10.0\n132.08 100.0\n115.05 30.0",
        tolerance: 0.1,
        toleranceUnit: "da",
        spectrumKind: "both",
        polarity: "positive",
        precursorMz: 132.0768,
        precursorTolerance: 5,
        precursorToleranceUnit: "ppm",
        precursorAdductIds: [],
        sourceTermId: undefined,
        minMatchedPeaks: 1,
        useMlRanking: true,
        page: 1,
        limit: 10,
      });

      setResult(data);
      setPage(data.pagination.page);
      setPageInput(String(data.pagination.page));
    } catch (error) {
      setResult(null);
      setErrorMessage(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }

  function handleLimitChange(value: string) {
    const nextLimit = Number(value);
    if (!isLimitOption(nextLimit)) return;
    setLimitDraft(nextLimit);
    setPage(1);
    setPageInput("1");
  }

  function handleGraphMinIntensityChange(value: string) {
    const nextValue = Number(value);
    if (!isGraphMinIntensityOption(nextValue)) return;
    setGraphMinIntensity(nextValue);
  }

  function goToPage(nextPage: number) {
    const safePage = clampPage(nextPage, result?.pagination.totalPages ?? 1);
    runSearch(safePage);
  }

  const selectedHmdbUrl = buildHmdbSpectrumUrl(selectedResult?.hmdbSpectrumId);

  const prefilterLcMsLinks = result?.prefilter
    ? polarityDraft === "both"
      ? [
          {
            label: "View positive LC-MS/adduct candidates",
            href: buildLcMsAdductSearchUrl({
              precursorMz: result.prefilter.precursorMz,
              ionMode: "positive",
              tolerance: result.prefilter.tolerance,
              toleranceUnit: result.prefilter.toleranceUnit,
              selectedAdductIds: [],
              sourceTermId: sourceTermIdDraft,
              limit: limitDraft,
            }),
          },
          {
            label: "View negative LC-MS/adduct candidates",
            href: buildLcMsAdductSearchUrl({
              precursorMz: result.prefilter.precursorMz,
              ionMode: "negative",
              tolerance: result.prefilter.tolerance,
              toleranceUnit: result.prefilter.toleranceUnit,
              selectedAdductIds: [],
              sourceTermId: sourceTermIdDraft,
              limit: limitDraft,
            }),
          },
        ]
      : [
          {
            label: "View in LC-MS/adduct search",
            href: buildLcMsAdductSearchUrl({
              precursorMz: result.prefilter.precursorMz,
              ionMode: polarityDraft,
              tolerance: result.prefilter.tolerance,
              toleranceUnit: result.prefilter.toleranceUnit,
              selectedAdductIds: result.prefilter.selectedAdductIds,
              sourceTermId: sourceTermIdDraft,
              limit: limitDraft,
            }),
          },
        ]
    : [];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.10),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef7f8)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <SectionPanel variant="glass">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Search Options</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">LC-MS/MS Search</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Search a pasted MS/MS peak list against library spectra using greedy cosine similarity. Query
                intensities are normalized to max 100.
              </p>
            </div>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </SectionPanel>

        <SectionPanel>
          <form className="grid gap-6 lg:grid-cols-[1fr_420px]" onSubmit={handleSearchSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-950" htmlFor="msms-peak-list">
                MS/MS peak list
              </label>
              <textarea
                id="msms-peak-list"
                value={peakListDraft}
                onChange={(event) => setPeakListDraft(event.target.value)}
                className="min-h-72 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder={"109.2 3.407\n124.2 47.4946\n170.16 100"}
              />
              <p className="text-xs text-slate-500">
                Enter one peak per line as m/z intensity. Spaces, tabs, commas, and extra columns are accepted; only the
                first two numeric columns are used.
              </p>
            </div>

            <div className="space-y-4">
              <div id="tour-tolerance" className="grid grid-cols-[1fr_120px] gap-3 transition-all duration-300">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-950">Fragment tolerance ±</label>
                  <Input
                    value={toleranceDraft}
                    onChange={(event) => setToleranceDraft(event.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-950">Unit</label>
                  <Select
                    value={toleranceUnitDraft}
                    onValueChange={(value) => setToleranceUnitDraft(value as ToleranceUnit)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="da">Da</SelectItem>
                      <SelectItem value="ppm">ppm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div id="tour-spectrum-kind" className="space-y-1 transition-all duration-300">
                <label className="text-sm font-semibold text-slate-950">Spectrum kind</label>
                <Select
                  value={spectrumKindDraft}
                  onValueChange={(value) => setSpectrumKindDraft(value as SpectrumKind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="experimental">Experimental</SelectItem>
                    <SelectItem value="predicted">Predicted</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-950">Polarity / Ion Mode</label>
                <Select value={polarityDraft} onValueChange={(value) => setPolarityDraft(value as MsMsPolarity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-950">Source</label>
                <Select value={sourceTermIdDraft} onValueChange={setSourceTermIdDraft}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any source</SelectItem>
                    {sourceTerms.map((sourceTerm) => (
                      <SelectItem key={sourceTerm.id} value={String(sourceTerm.id)}>
                        {sourceTerm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-950">Minimum matched peaks</label>
                  <Input
                    value={minMatchedPeaksDraft}
                    onChange={(event) => setMinMatchedPeaksDraft(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-950">Rows</label>
                  <Select value={String(limitDraft)} onValueChange={handleLimitChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIMIT_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {metadataError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {metadataError}
                </div>
              ) : null}
            </div>

            <div className="border-t border-cyan-900/10 pt-4 lg:col-span-2">
              <Button
                id="tour-precursor-toggle"
                type="button"
                variant="outline"
                onClick={() => setShowPrecursorFilter((current) => !current)}
                className="transition-all duration-300"
              >
                {showPrecursorFilter ? "Hide precursor filter" : "Show precursor filter"}
              </Button>

              {showPrecursorFilter ? (
                <div className="mt-4 rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">Precursor / adduct m/z filter</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Optional. Filters candidate compounds using precomputed theoretical adduct m/z before cosine
                        scoring.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={clearPrecursorFilter}>
                      Clear precursor filter
                    </Button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-slate-950">Precursor / adduct m/z</label>
                        <Input
                          value={precursorMzDraft}
                          onChange={(event) => setPrecursorMzDraft(event.target.value)}
                          inputMode="decimal"
                          placeholder="299.2946"
                        />
                      </div>

                      <div id="tour-ml-ranking" className="transition-all duration-300">
                        <label className="flex items-center gap-2 mt-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={useMlRanking}
                            disabled={!precursorMzDraft.trim()}
                            onChange={(event) => setUseMlRanking(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className={!precursorMzDraft.trim() ? "text-slate-400" : ""}>
                            Use ML Re-ranking (Random Forest)
                          </span>
                        </label>
                      </div>

                      <div className="grid grid-cols-[1fr_120px] gap-3">
                        <div className="space-y-1">
                          <label className="text-sm font-semibold text-slate-950">Precursor tolerance ±</label>
                          <Input
                            value={precursorToleranceDraft}
                            onChange={(event) => setPrecursorToleranceDraft(event.target.value)}
                            inputMode="decimal"
                            placeholder="5"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-semibold text-slate-950">Unit</label>
                          <Select
                            value={precursorToleranceUnitDraft}
                            onValueChange={(value) => setPrecursorToleranceUnitDraft(value as ToleranceUnit)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ppm">ppm</SelectItem>
                              <SelectItem value="da">Da</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-semibold text-slate-950">Adduct Type</label>
                        <span className="text-xs text-slate-500">
                          {polarityDraft === "both"
                            ? "Unknown / all enabled adducts"
                            : precursorAdductIdsDraft.length === 0
                              ? "Unknown / all enabled adducts"
                              : `${precursorAdductIdsDraft.length} selected`}
                        </span>
                      </div>

                      {polarityDraft === "both" ? (
                        <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
                          Adduct selection is disabled when Polarity / Ion Mode is Both. The prefilter will use all
                          enabled positive and negative adducts.
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto rounded-md border bg-white p-3">
                          <button
                            type="button"
                            className={
                              precursorAdductIdsDraft.length === 0
                                ? "mb-3 w-full rounded-md border border-cyan-700 bg-cyan-950/5 px-3 py-2 text-left text-sm font-medium text-cyan-900"
                                : "mb-3 w-full rounded-md border px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                            }
                            onClick={() => setPrecursorAdductIdsDraft([])}
                          >
                            Unknown / all enabled adducts
                          </button>

                          {adductOptions.length === 0 ? (
                            <p className="text-sm text-slate-500">No adduct options loaded.</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {adductOptions.map((adduct) => (
                                <label key={adduct.id} className="flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={precursorAdductIdsDraft.includes(adduct.id)}
                                    onChange={() => togglePrecursorAdduct(adduct.id)}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  <span>{adduct.label}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {adductMetadataError ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                          {adductMetadataError}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-cyan-900/10 pt-4 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={loadExample}>
                  Load Example
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={peakListDraft.trim().length === 0 || isLoading}>
                    {isLoading ? "Searching..." : "Search"}
                  </Button>
                  <Button type="button" variant="destructive" onClick={resetSearch}>
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </SectionPanel>

        {errorMessage ? (
          <SectionPanel className="border-destructive/40 bg-destructive/10 text-sm text-destructive">
            {errorMessage}
          </SectionPanel>
        ) : null}

        {selectedResult ? (
          <SectionPanel>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Compare Spectrum</h2>
                <p className="text-sm text-slate-600">
                  Selected match: {selectedResult.name} · similarity {formatPercent(selectedResult.cosinePercent)}% ·{" "}
                  {selectedResult.matchedPeaks} matched peaks.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Graph min</span>
                  <Select value={String(graphMinIntensity)} onValueChange={handleGraphMinIntensityChange}>
                    <SelectTrigger className="h-9 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRAPH_MIN_INTENSITY_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          {option}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/spectra/ms-ms/${selectedResult.hmdbSpectrumId}`}>Detail</Link>
                </Button>
                {selectedHmdbUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={selectedHmdbUrl} target="_blank" rel="noreferrer">
                      HMDB
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
            {isSpectrumLoading ? (
              <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-500">
                Loading selected spectrum...
              </div>
            ) : (
              <MirrorSpectrumGraph
                queryPeaks={result?.queryPeaks ?? []}
                libraryPeaks={selectedSpectrumDetail?.peaks ?? []}
                matchedPairs={selectedResult.matchedPeakPairs}
                minIntensity={graphMinIntensity}
              />
            )}
          </SectionPanel>
        ) : null}

        {result ? (
          <SectionPanel>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Search Results</h2>
                <p className="text-sm text-slate-600">
                  Click a row or chart bar to select a candidate and update the comparison graph.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Candidate cap {result.candidateLimit} · scored {result.scoredCandidates}
              </div>
            </div>

            {/* ML Probability Bar Chart */}
            {(() => {
              const hasMlResults = result.rows.some((row) => row.mlProbability !== undefined);
              if (!hasMlResults) return null;

              const topRowsForChart = result.rows.slice(0, 5);
              return (
                <div className="mb-6 rounded-lg border border-blue-900/10 bg-blue-50/20 p-4 animate-in fade-in duration-300">
                  <h3 className="text-sm font-semibold text-blue-950 mb-3 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    Top Candidate ML Probabilities (Random Forest Classifier)
                  </h3>
                  <div className="space-y-3">
                    {topRowsForChart.map((row) => {
                      const prob = row.mlProbability ?? 0;
                      const pct = prob * 100;
                      const isSelected = selectedResult?.hmdbSpectrumId === row.hmdbSpectrumId;

                      return (
                        <div
                          key={row.hmdbSpectrumId}
                          onClick={() => setSelectedResult(row)}
                          className={`group cursor-pointer rounded-md p-2 transition-all hover:bg-blue-50/50 ${
                            isSelected ? "bg-blue-50/80 ring-1 ring-blue-300" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-800 truncate max-w-[70%]">
                              {row.name} <span className="font-mono text-slate-400">({row.accession})</span>
                            </span>
                            <span className="font-mono font-bold text-blue-700">{pct.toFixed(2)}% probability</span>
                          </div>
                          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isSelected
                                  ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                                  : "bg-gradient-to-r from-blue-400 to-blue-500 group-hover:from-blue-500 group-hover:to-blue-600"
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {result.prefilter ? (
              <div className="mb-4 rounded-md border border-cyan-900/10 bg-cyan-950/5 p-3 text-sm text-slate-700">
                <div>{result.prefilter.message}</div>
                {result.prefilter.precursorMzApplied ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Precursor / adduct m/z {result.prefilter.precursorMz} ± {result.prefilter.tolerance}{" "}
                    {result.prefilter.toleranceUnit}; adduct mode: {result.prefilter.adductMode}.
                    {sourceTermIdDraft !== "any" ? " Source filter is included in the LC-MS/adduct lookup link." : null}
                  </div>
                ) : null}

                {prefilterLcMsLinks.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {prefilterLcMsLinks.map((link) => (
                      <Button key={link.href} asChild variant="outline" size="sm">
                        <Link href={link.href} target="_blank" rel="noreferrer">
                          {link.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-md border lg:overflow-x-visible">
              {(() => {
                const hasMlResults = result.rows.some((row) => row.mlProbability !== undefined);
                return (
                  <Table className="min-w-210 table-fixed lg:min-w-0 lg:w-full">
                    <TableHeader className="bg-cyan-950/5">
                      <TableRow>
                        {hasMlResults && <TableHead className="w-20 lg:w-[6%]">ML Rank</TableHead>}
                        <TableHead className="w-74 lg:w-[34%]">Compound</TableHead>
                        <TableHead className="w-30 lg:w-[14%]">Spectrum</TableHead>
                        <TableHead className="w-24 lg:w-[11%]">Type</TableHead>
                        <TableHead className="w-31 lg:w-[15%]">Instrument</TableHead>
                        <TableHead className="w-22 lg:w-[9%]">Collision</TableHead>
                        <TableHead className="w-24 lg:w-[8%]">Matched</TableHead>
                        <TableHead className="w-25 lg:w-[9%]">Similarity (%)</TableHead>
                        {hasMlResults && <TableHead className="w-28 lg:w-[10%]">ML Prob</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading && result.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={hasMlResults ? 9 : 7} className="h-24 text-center text-slate-500">
                            Loading results...
                          </TableCell>
                        </TableRow>
                      ) : result.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={hasMlResults ? 9 : 7} className="h-24 text-center text-slate-500">
                            No MS/MS matches found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        result.rows.map((row) => {
                          const selected = selectedResult?.hmdbSpectrumId === row.hmdbSpectrumId;
                          return (
                            <TableRow
                              key={`${row.spectrumId}-${row.hmdbSpectrumId}`}
                              className={selected ? "cursor-pointer bg-cyan-950/5" : "cursor-pointer"}
                              onClick={() => setSelectedResult(row)}
                            >
                              {hasMlResults && (
                                <TableCell className="align-top font-mono text-xs tabular-nums text-slate-600">
                                  {row.mlRank !== undefined ? `#${row.mlRank}` : "—"}
                                </TableCell>
                              )}
                              <TableCell className="align-top">
                                <div className="min-w-0 space-y-1">
                                  <Link
                                    href={`/compounds/${row.accession}`}
                                    className="block truncate font-mono text-xs font-medium text-cyan-800 underline-offset-4 hover:underline"
                                    onClick={(event) => event.stopPropagation()}
                                    title={row.accession}
                                  >
                                    {row.accession}
                                  </Link>
                                  <div className="truncate text-sm font-medium text-slate-900" title={row.name}>
                                    {row.name}
                                  </div>
                                  <div className="truncate text-xs text-slate-600">
                                    <ChemicalFormula formula={row.chemicalFormula} />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="align-top font-mono text-xs">
                                <Link
                                  href={`/spectra/ms-ms/${row.hmdbSpectrumId}`}
                                  className="text-cyan-800 underline-offset-4 hover:underline"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {row.hmdbSpectrumId}
                                </Link>
                              </TableCell>
                              <TableCell className="align-top text-xs">
                                <div>{row.spectrumType}</div>
                                <div className="text-slate-500">{formatNullableText(row.polarity)}</div>
                              </TableCell>
                              <TableCell className="truncate align-top text-xs" title={row.instrumentType ?? undefined}>
                                {row.instrumentType ?? "—"}
                              </TableCell>
                              <TableCell className="align-top font-mono text-xs tabular-nums">
                                {formatNullableNumber(row.collisionEnergyVoltage)}
                              </TableCell>
                              <TableCell className="align-top font-mono text-xs tabular-nums">
                                {row.matchedPeaks}/{row.totalQueryPeaks}
                              </TableCell>
                              <TableCell className="align-top font-mono text-sm font-semibold tabular-nums text-cyan-900">
                                {formatPercent(row.cosinePercent)}
                              </TableCell>
                              {hasMlResults && (
                                <TableCell className="align-top font-mono text-sm font-semibold tabular-nums text-blue-900">
                                  {row.mlProbability !== undefined ? `${(row.mlProbability * 100).toFixed(2)}%` : "—"}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                );
              })()}
            </div>

            <PaginationControls
              page={result.pagination.page}
              totalPages={result.pagination.totalPages}
              totalRows={result.pagination.totalRows}
              pageInput={pageInput}
              isLoading={isLoading}
              hasPreviousPage={result.pagination.hasPreviousPage}
              hasNextPage={result.pagination.hasNextPage}
              onPageInputChange={setPageInput}
              onPageJump={() => goToPage(Number(pageInput))}
              onPageChange={goToPage}
            />
          </SectionPanel>
        ) : (
          <SectionPanel className="text-sm text-slate-600">Enter an MS/MS peak list and click Search.</SectionPanel>
        )}
      </div>

      {/* Semi-transparent blue backdrop overlay for tour */}
      {tourStep !== null && (
        <div
          className="fixed inset-0 bg-blue-900/40 z-[60] backdrop-blur-[1px] transition-opacity duration-300"
          onClick={() => setTourStep(null)}
        />
      )}

      {/* Tour dialog tooltip card */}
      {tourStep !== null && (
        <div className="fixed bottom-24 right-6 w-96 rounded-xl border border-cyan-800/10 bg-white p-5 shadow-2xl z-[70] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">
              Guided Tour · Step {tourStep + 1} of {TOUR_STEPS.length}
            </span>
            <button
              onClick={() => setTourStep(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
            >
              Skip Tour
            </button>
          </div>
          <h4 className="text-base font-semibold text-slate-900 mb-2">
            {TOUR_STEPS[tourStep].title}
          </h4>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            {TOUR_STEPS[tourStep].description}
          </p>
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              disabled={tourStep === 0}
              onClick={() => setTourStep((prev) => (prev !== null ? prev - 1 : null))}
            >
              Previous
            </Button>
            <div className="flex gap-2">
              {tourStep === TOUR_STEPS.length - 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  onClick={runMlExample}
                >
                  Run Example
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  if (tourStep === TOUR_STEPS.length - 1) {
                    setTourStep(null);
                  } else {
                    setTourStep((prev) => (prev !== null ? prev + 1 : null));
                  }
                }}
              >
                {tourStep === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating help / restart tour button */}
      <button
        onClick={() => setTourStep(0)}
        title="Start Guided Tour"
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full bg-cyan-700 hover:bg-cyan-800 text-white shadow-lg flex items-center justify-center font-bold text-lg transition-transform hover:scale-105 active:scale-95 z-50 cursor-pointer"
      >
        ?
      </button>
    </main>
  );
}
