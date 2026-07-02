"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PaginationControls } from "../../../../components/pagination-controls";
import { SectionPanel } from "../../../../components/section-panel";
import { Button } from "../../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import { fetchJson } from "../../../../lib/api-client";
import { formatNullableNumber, formatNullableText } from "../../../../lib/format";

type SpectrumPeak = {
  mz: number;
  intensity: number;
  rawIntensity?: number | null;
  normalizedIntensity?: number | null;
  hmdbPeakId?: number | null;
  hmdbMsmsId?: number | null;
};

type CompoundSummary = {
  compoundId?: number;
  accession: string;
  name: string;
  chemicalFormula?: string | null;
  monoisotopicMolecularWeight?: number | null;
  averageMolecularWeight?: number | null;
};

type SpectrumDetail = {
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
  compound: CompoundSummary;
  peaks: SpectrumPeak[];
};

type SpectrumDetailClientProps = {
  hmdbSpectrumId: string;
};

type PeakSortBy = "index" | "mz" | "intensity" | "rawIntensity" | "normalizedIntensity" | "hmdbPeakId";
type SortDirection = "asc" | "desc";

type PeakSortState = {
  sortBy: PeakSortBy;
  sortDirection: SortDirection;
};

const LIMIT_OPTIONS = [10, 25, 50, 100] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

const DEFAULT_PEAK_TABLE_PAGE_SIZE: LimitOption = 10;
const GRAPH_WIDTH = 900;
const GRAPH_HEIGHT = 320;
const GRAPH_PADDING = {
  top: 24,
  right: 28,
  bottom: 56,
  left: 76,
};
const HMDB_BASE_URL = process.env.NEXT_PUBLIC_HMDB_BASE_URL ?? "https://hmdb.ca";

function buildHmdbSpectrumUrl(hmdbSpectrumId: number | string | null | undefined) {
  if (hmdbSpectrumId === null || hmdbSpectrumId === undefined || !HMDB_BASE_URL) return null;

  return `${HMDB_BASE_URL.replace(/\/$/, "")}/spectra/ms_ms/${encodeURIComponent(String(hmdbSpectrumId))}`;
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value)) return 1;
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(value)), totalPages);
}

function isLimitOption(value: number): value is LimitOption {
  return (LIMIT_OPTIONS as readonly number[]).includes(value);
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizePeak(value: unknown): SpectrumPeak | null {
  if (Array.isArray(value) && value.length >= 2) {
    const mz = Number(value[0]);
    const intensity = Number(value[1]);
    if (Number.isFinite(mz) && Number.isFinite(intensity)) return { mz, intensity };
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const mz = Number(record.mz ?? record.massToCharge ?? record.mass_to_charge ?? record.x);
    const intensity = Number(record.intensity ?? record.relativeIntensity ?? record.relative_intensity ?? record.y);

    if (Number.isFinite(mz) && Number.isFinite(intensity)) {
      return {
        mz,
        intensity,
        rawIntensity: toNullableNumber(record.rawIntensity ?? record.raw_intensity),
        normalizedIntensity: toNullableNumber(record.normalizedIntensity ?? record.normalized_intensity),
        hmdbPeakId: toNullableNumber(record.hmdbPeakId ?? record.hmdb_peak_id),
        hmdbMsmsId: toNullableNumber(record.hmdbMsmsId ?? record.hmdb_msms_id),
      };
    }
  }

  return null;
}

function normalizePeaks(peaks: unknown): SpectrumPeak[] {
  if (!Array.isArray(peaks)) return [];

  return peaks
    .map(normalizePeak)
    .filter((peak): peak is SpectrumPeak => Boolean(peak))
    .filter((peak) => peak.mz >= 0 && peak.intensity >= 0)
    .sort((a, b) => a.mz - b.mz);
}

function formatPeakNumber(value: number, digits = 4) {
  if (!Number.isFinite(value)) return "—";
  const formatted = value.toFixed(digits);
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/0+$/, "").replace(/\.$/, "");
}

function niceCeil(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0) return step;
  return Math.ceil(value / step) * step;
}

function compareNullableNumber(left: number | null | undefined, right: number | null | undefined, direction: SortDirection) {
  const leftMissing = left === null || left === undefined || !Number.isFinite(Number(left));
  const rightMissing = right === null || right === undefined || !Number.isFinite(Number(right));
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  const diff = Number(left) - Number(right);
  return direction === "asc" ? diff : -diff;
}

function getPeakSortValue(peak: SpectrumPeak, index: number, sortBy: PeakSortBy) {
  if (sortBy === "index") return index + 1;
  if (sortBy === "mz") return peak.mz;
  if (sortBy === "intensity") return peak.intensity;
  if (sortBy === "rawIntensity") return peak.rawIntensity;
  if (sortBy === "normalizedIntensity") return peak.normalizedIntensity;
  if (sortBy === "hmdbPeakId") return peak.hmdbPeakId;
  return peak.mz;
}

function getPeakSortIndicator(sort: PeakSortState, sortBy: PeakSortBy) {
  if (sort.sortBy !== sortBy) return "↕";
  return sort.sortDirection === "asc" ? "↑" : "↓";
}

function PeakGraph({ peaks }: { peaks: SpectrumPeak[] }) {
  const [hoveredPeak, setHoveredPeak] = useState<{ peak: SpectrumPeak; x: number; y: number } | null>(null);

  if (peaks.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border bg-slate-50 text-sm text-slate-500">
        No peak data available for graph visualization.
      </div>
    );
  }

  const minMz = 0;
  const maxMz = niceCeil(Math.max(...peaks.map((peak) => peak.mz)), 10);
  const maxIntensity = Math.max(100, niceCeil(Math.max(...peaks.map((peak) => peak.intensity)), 10));
  const plotWidth = GRAPH_WIDTH - GRAPH_PADDING.left - GRAPH_PADDING.right;
  const plotHeight = GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom;
  const xAxisY = GRAPH_PADDING.top + plotHeight;
  const xRange = maxMz - minMz || 1;

  const xForMz = (mz: number) => GRAPH_PADDING.left + ((mz - minMz) / xRange) * plotWidth;
  const yForIntensity = (intensity: number) =>
    GRAPH_PADDING.top + plotHeight - (intensity / (maxIntensity || 1)) * plotHeight;

  const xTicks = Array.from({ length: Math.floor(maxMz / 10) + 1 }, (_, index) => index * 10);
  const yTicks = Array.from({ length: 6 }, (_, index) => (maxIntensity * index) / 5);

  return (
    <div className="relative overflow-x-auto rounded-md border bg-white p-3">
      <svg
        role="img"
        aria-label="MS/MS peak graph"
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
              y2={xAxisY}
              stroke="currentColor"
              className="text-slate-300"
              strokeWidth="1"
              strokeDasharray="1 2"
            />
          );
        })}

        {yTicks.map((tick) => {
          const y = yForIntensity(tick);
          return (
            <line
              key={`y-grid-${tick}`}
              x1={GRAPH_PADDING.left}
              y1={y}
              x2={GRAPH_PADDING.left + plotWidth}
              y2={y}
              stroke="currentColor"
              className="text-slate-300"
              strokeWidth="1"
              strokeDasharray="1 2"
            />
          );
        })}

        <line x1={GRAPH_PADDING.left} y1={xAxisY} x2={GRAPH_PADDING.left + plotWidth} y2={xAxisY} stroke="currentColor" className="text-slate-500" strokeWidth="1" />
        <line x1={GRAPH_PADDING.left} y1={GRAPH_PADDING.top} x2={GRAPH_PADDING.left} y2={xAxisY} stroke="currentColor" className="text-slate-500" strokeWidth="1" />

        {xTicks.map((tick) => {
          const x = xForMz(tick);
          return (
            <g key={`x-${tick}`}>
              <line x1={x} y1={xAxisY} x2={x} y2={xAxisY + 5} stroke="currentColor" className="text-slate-400" />
              <text x={x} y={xAxisY + 24} textAnchor="middle" className="fill-slate-600 text-[11px]">
                {formatPeakNumber(tick, 0)}
              </text>
            </g>
          );
        })}

        {yTicks.map((tick) => {
          const y = yForIntensity(tick);
          return (
            <g key={`y-${tick}`}>
              <line x1={GRAPH_PADDING.left - 5} y1={y} x2={GRAPH_PADDING.left} y2={y} stroke="currentColor" className="text-slate-400" />
              <text x={GRAPH_PADDING.left - 10} y={y + 4} textAnchor="end" className="fill-slate-600 text-[11px]">
                {formatPeakNumber(tick, 0)}
              </text>
            </g>
          );
        })}

        {peaks.map((peak, index) => {
          const x = xForMz(peak.mz);
          const y = yForIntensity(peak.intensity);
          return (
            <g key={`${peak.hmdbPeakId ?? "peak"}-${peak.hmdbMsmsId ?? "msms"}-${peak.mz}-${index}`}>
              <line x1={x} y1={xAxisY} x2={x} y2={y} stroke="currentColor" className="text-sky-500" strokeWidth="2" />
              <line
                x1={x}
                y1={GRAPH_PADDING.top}
                x2={x}
                y2={xAxisY}
                stroke="transparent"
                strokeWidth="14"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredPeak({ peak, x, y })}
                onMouseMove={() => setHoveredPeak({ peak, x, y })}
              />
            </g>
          );
        })}

        {hoveredPeak ? (
          <g pointerEvents="none">
            <line x1={hoveredPeak.x} y1={GRAPH_PADDING.top} x2={hoveredPeak.x} y2={xAxisY} stroke="currentColor" className="text-slate-400" strokeWidth="1" strokeDasharray="3 3" />
            <rect x={Math.min(hoveredPeak.x + 10, GRAPH_WIDTH - 180)} y={Math.max(hoveredPeak.y - 54, GRAPH_PADDING.top)} width="168" height="44" rx="6" className="fill-slate-900" opacity="0.92" />
            <text x={Math.min(hoveredPeak.x + 22, GRAPH_WIDTH - 168)} y={Math.max(hoveredPeak.y - 31, GRAPH_PADDING.top + 23)} className="fill-white text-[12px] font-medium">
              m/z: {formatPeakNumber(hoveredPeak.peak.mz)}
            </text>
            <text x={Math.min(hoveredPeak.x + 22, GRAPH_WIDTH - 168)} y={Math.max(hoveredPeak.y - 14, GRAPH_PADDING.top + 40)} className="fill-white text-[12px]">
              Intensity: {formatPeakNumber(hoveredPeak.peak.intensity, 2)}
            </text>
          </g>
        ) : null}

        <text x={GRAPH_PADDING.left + plotWidth / 2} y={GRAPH_HEIGHT - 12} textAnchor="middle" className="fill-slate-700 text-[13px] font-medium">
          m/z
        </text>
        <text x={20} y={GRAPH_PADDING.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 20 ${GRAPH_PADDING.top + plotHeight / 2})`} className="fill-slate-700 text-[13px] font-medium">
          Relative Intensity
        </text>
      </svg>
    </div>
  );
}

export function SpectrumDetailClient({ hmdbSpectrumId }: SpectrumDetailClientProps) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [spectrum, setSpectrum] = useState<SpectrumDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [peakSort, setPeakSort] = useState<PeakSortState>({ sortBy: "mz", sortDirection: "asc" });
  const [peakPage, setPeakPage] = useState(1);
  const [peakPageInput, setPeakPageInput] = useState("1");
  const [peakLimit, setPeakLimit] = useState<LimitOption>(DEFAULT_PEAK_TABLE_PAGE_SIZE);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadSpectrum() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await fetchJson<SpectrumDetail>(`/api/spectra/ms-ms/${encodeURIComponent(hmdbSpectrumId)}`, abortController.signal);
        setSpectrum(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSpectrum(null);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load spectrum detail");
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false);
      }
    }

    loadSpectrum();
    return () => abortController.abort();
  }, [hmdbSpectrumId]);

  useEffect(() => {
    setPeakPageInput(String(peakPage));
  }, [peakPage]);

  useEffect(() => {
    setPeakPage(1);
    setPeakPageInput("1");
  }, [spectrum?.hmdbSpectrumId]);

  const peaks = useMemo(() => normalizePeaks(spectrum?.peaks), [spectrum?.peaks]);

  const topPeaks = useMemo(() => [...peaks].sort((a, b) => b.intensity - a.intensity).slice(0, 10), [peaks]);

  const sortedPeaks = useMemo(() => {
    return peaks
      .map((peak, index) => ({ peak, originalIndex: index }))
      .sort((left, right) => {
        const result = compareNullableNumber(
          getPeakSortValue(left.peak, left.originalIndex, peakSort.sortBy),
          getPeakSortValue(right.peak, right.originalIndex, peakSort.sortBy),
          peakSort.sortDirection,
        );

        if (result !== 0) return result;
        return left.peak.mz - right.peak.mz || left.originalIndex - right.originalIndex;
      });
  }, [peaks, peakSort.sortBy, peakSort.sortDirection]);

  const peakTotalPages = Math.max(1, Math.ceil(sortedPeaks.length / peakLimit));
  const safePeakPage = clampPage(peakPage, peakTotalPages);
  const canNavigatePeaks = peakTotalPages > 0 && !isLoading;

  const paginatedPeaks = useMemo(() => {
    const start = (safePeakPage - 1) * peakLimit;
    return sortedPeaks.slice(start, start + peakLimit);
  }, [sortedPeaks, safePeakPage, peakLimit]);

  const compoundAccession = spectrum?.compound?.accession ?? null;
  const compoundName = spectrum?.compound?.name ?? null;
  const hmdbSpectrumUrl = buildHmdbSpectrumUrl(spectrum?.hmdbSpectrumId);

  function handlePeakSort(nextSortBy: PeakSortBy) {
    setPeakSort((current) => ({
      sortBy: nextSortBy,
      sortDirection: current.sortBy === nextSortBy && current.sortDirection === "asc" ? "desc" : "asc",
    }));
    setPeakPage(1);
    setPeakPageInput("1");
  }

  function PeakSortButton(props: { sortBy: PeakSortBy; children: ReactNode }) {
    return (
      <button type="button" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" onClick={() => handlePeakSort(props.sortBy)}>
        <span>{props.children}</span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">{getPeakSortIndicator(peakSort, props.sortBy)}</span>
      </button>
    );
  }

  function goToPeakPage(nextPage: number) {
    const safePage = clampPage(nextPage, peakTotalPages);
    setPeakPage(safePage);
    setPeakPageInput(String(safePage));
  }

  function handlePeakPageJumpFromControls() {
    if (!canNavigatePeaks) return;
    goToPeakPage(Number(peakPageInput));
  }

  function handlePeakLimitChange(value: string) {
    const nextLimit = Number(value);
    if (!isLimitOption(nextLimit)) return;
    setPeakLimit(nextLimit);
    setPeakPage(1);
    setPeakPageInput("1");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.10),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef7f8)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="outline" className="w-fit">
            {returnTo ? <Link href={returnTo}>← Back</Link> : <Link href="/search/compounds">← Compound search</Link>}
          </Button>

          <div className="flex flex-wrap gap-2">
            {compoundAccession ? (
              <Button asChild variant="outline" className="w-fit"><Link href={`/compounds/${compoundAccession}`}>Compound detail</Link></Button>
            ) : null}
            {hmdbSpectrumUrl ? (
              <Button asChild variant="outline" className="w-fit"><a href={hmdbSpectrumUrl} target="_blank" rel="noreferrer">View on HMDB</a></Button>
            ) : null}
            <Button asChild variant="outline" className="w-fit"><Link href="/">Home</Link></Button>
          </div>
        </div>

        <SectionPanel variant="glass">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">MS/MS Spectrum Detail</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{hmdbSpectrumId}</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">Inspect spectrum metadata, compound context, peak graph, and peak table for this MS/MS record.</p>
          </div>
        </SectionPanel>

        {isLoading ? <SectionPanel className="text-sm text-slate-600">Loading spectrum detail...</SectionPanel> : null}
        {errorMessage ? <SectionPanel className="border-destructive/40 bg-destructive/10 text-sm text-destructive">{errorMessage}</SectionPanel> : null}

        {spectrum ? (
          <>
            <SectionPanel>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Spectrum Metadata</h2>
                  <p className="text-sm text-slate-600">{compoundName ? `Linked compound: ${compoundName}` : "Spectrum metadata and acquisition context."}</p>
                </div>
                <div className="text-xs text-slate-500">{peaks.length} loaded peak{peaks.length === 1 ? "" : "s"}{spectrum.peakCounter != null ? ` · ${spectrum.peakCounter} reported` : ""}</div>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Spectrum ID</dt><dd className="mt-1 font-mono text-sm text-slate-950">{spectrum.hmdbSpectrumId}</dd></div>
                <div className="rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</dt><dd className="mt-1 text-sm text-slate-950">{formatNullableText(spectrum.spectrumType)}</dd></div>
                <div className="rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Polarity</dt><dd className="mt-1 text-sm text-slate-950">{formatNullableText(spectrum.polarity)}</dd></div>
                <div className="rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ionization</dt><dd className="mt-1 text-sm text-slate-950">{formatNullableText(spectrum.ionizationMode)}</dd></div>
                <div className="rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instrument</dt><dd className="mt-1 text-sm text-slate-950">{formatNullableText(spectrum.instrumentType)}</dd></div>
                <div className="rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Collision Voltage</dt><dd className="mt-1 text-sm text-slate-950">{formatNullableNumber(spectrum.collisionEnergyVoltage)}</dd></div>
                <div className="rounded-md border border-cyan-900/10 bg-cyan-950/2.5 p-3 sm:col-span-2 lg:col-span-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Splash</dt><dd className="mt-1 break-all font-mono text-xs text-slate-950">{formatNullableText(spectrum.splashKey)}</dd></div>
              </dl>
            </SectionPanel>

            {compoundAccession || compoundName ? (
              <SectionPanel>
                <h2 className="text-lg font-semibold text-slate-950">Compound Context</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accession</p><p className="mt-1 font-mono text-sm text-slate-950">{compoundAccession ? <Link href={`/compounds/${compoundAccession}`} className="text-cyan-800 underline-offset-4 hover:underline">{compoundAccession}</Link> : "—"}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</p><p className="mt-1 text-sm font-medium text-slate-950">{formatNullableText(compoundName)}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formula</p><p className="mt-1 font-mono text-sm text-slate-950">{formatNullableText(spectrum.compound.chemicalFormula)}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mono. MW</p><p className="mt-1 text-sm text-slate-950">{formatNullableNumber(spectrum.compound.monoisotopicMolecularWeight)}</p></div>
                </div>
              </SectionPanel>
            ) : null}

            <SectionPanel>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div><h2 className="text-lg font-semibold text-slate-950">Peak Graph</h2><p className="text-sm text-slate-600">Vertical stick plot of m/z versus relative intensity. Hover along each vertical m/z guide to inspect values.</p></div>
                {topPeaks.length > 0 ? <div className="text-xs text-slate-500">Top peak: m/z {formatPeakNumber(topPeaks[0].mz)} · intensity {formatPeakNumber(topPeaks[0].intensity, 2)}</div> : null}
              </div>
              <PeakGraph peaks={peaks} />
            </SectionPanel>

            <SectionPanel>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Peak Table</h2>
                  <p className="text-sm text-slate-600">Sortable peak list. Default order is m/z ascending. Sorted by {peakSort.sortBy} {peakSort.sortDirection}.</p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <div className="text-xs text-slate-500">{peaks.length} loaded peak{peaks.length === 1 ? "" : "s"}{spectrum.peakCounter != null ? ` · ${spectrum.peakCounter} reported` : ""}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows</span>
                    <Select value={String(peakLimit)} onValueChange={handlePeakLimitChange}>
                      <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LIMIT_OPTIONS.map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border">
                <Table className="table-fixed">
                  <TableHeader className="bg-cyan-950/5">
                    <TableRow>
                      <TableHead className="w-16"><PeakSortButton sortBy="index">#</PeakSortButton></TableHead>
                      <TableHead className="w-28"><PeakSortButton sortBy="mz">m/z</PeakSortButton></TableHead>
                      <TableHead className="w-32"><PeakSortButton sortBy="intensity">Intensity</PeakSortButton></TableHead>
                      <TableHead className="w-36"><PeakSortButton sortBy="rawIntensity">Raw Intensity</PeakSortButton></TableHead>
                      <TableHead className="w-36"><PeakSortButton sortBy="normalizedIntensity">Normalized</PeakSortButton></TableHead>
                      <TableHead className="w-28"><PeakSortButton sortBy="hmdbPeakId">Peak ID</PeakSortButton></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPeaks.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">No peak data available.</TableCell></TableRow>
                    ) : (
                      paginatedPeaks.map(({ peak, originalIndex }) => (
                        <TableRow key={`${peak.hmdbPeakId ?? "peak"}-${peak.hmdbMsmsId ?? "msms"}-${peak.mz}-${originalIndex}`}>
                          <TableCell className="font-mono text-xs">{originalIndex + 1}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">{formatPeakNumber(peak.mz)}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">{formatPeakNumber(peak.intensity, 2)}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">{peak.rawIntensity == null ? "—" : formatPeakNumber(peak.rawIntensity, 4)}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">{peak.normalizedIntensity == null ? "—" : formatPeakNumber(peak.normalizedIntensity, 4)}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">{peak.hmdbPeakId ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <PaginationControls
                page={safePeakPage}
                totalPages={peakTotalPages}
                totalRows={sortedPeaks.length}
                pageInput={peakPageInput}
                isLoading={isLoading}
                hasPreviousPage={safePeakPage > 1}
                hasNextPage={safePeakPage < peakTotalPages}
                onPageInputChange={setPeakPageInput}
                onPageJump={handlePeakPageJumpFromControls}
                onPageChange={goToPeakPage}
                label="Peak page"
              />
            </SectionPanel>
          </>
        ) : null}
      </div>
    </main>
  );
}
