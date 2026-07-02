"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { ChemicalFormula } from "@/components/chemical-formula";
import { fetchJson, isRecord } from "@/lib/api-client";
import { formatNullableNumber, formatNullableText } from "@/lib/format";
import { SectionPanel } from "../../../components/section-panel";
import { PaginationControls } from "../../../components/pagination-controls";

type CompoundDetail = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  averageMolecularWeight: number | null;
  monoisotopicMolecularWeight: number | null;
  iupacName: string | null;
  traditionalIupac: string | null;
  sourcesHierarchy: unknown;
  createdAt: string | Date;
};

type CompoundDetailResponse = {
  compound: CompoundDetail;
  sourceTerms?: unknown[];
};

type CompoundAdductRow = {
  adductId: number;
  label: string;
  ionMode: "positive" | "negative";
  charge: number;
  massMultiplier: number;
  massShift: number;
  theoreticalMz: number;
  enabled: boolean;
};

type SpectrumRow = {
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
  createdAt: string | Date;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type PaginatedSpectraResponse = {
  rows: SpectrumRow[];
  pagination: PaginationMeta;
};

type ApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type SourceHierarchyItem = {
  term: string;
  level: number;
  parentTerm?: string | null;
};

type SpectrumKind = "both" | "experimental" | "predicted";
type SpectrumPolarity = "both" | "positive" | "negative";
type SpectraSortBy = "hmdbSpectrumId" | "polarity" | "collisionEnergyVoltage" | "peakCounter";
type SortDirection = "asc" | "desc";

type SpectraSortState = {
  sortBy: SpectraSortBy | null;
  sortDirection: SortDirection;
};

const LIMIT_OPTIONS = [10, 25, 50, 100] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

const HMDB_BASE_URL = process.env.NEXT_PUBLIC_HMDB_BASE_URL ?? "https://hmdb.ca";

function normalizeSourceHierarchy(value: unknown): SourceHierarchyItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SourceHierarchyItem | null => {
      if (!isRecord(item)) return null;

      const rawTerm = item.term;
      if (typeof rawTerm !== "string" || rawTerm.trim().length === 0) {
        return null;
      }

      const rawLevel = item.level;
      const level = typeof rawLevel === "number" && Number.isFinite(rawLevel) ? rawLevel : 1;

      const rawParentTerm = item.parent_term ?? item.parentTerm;
      const parentTerm = typeof rawParentTerm === "string" ? rawParentTerm : null;

      return {
        term: rawTerm,
        level: Math.max(1, Math.trunc(level)),
        parentTerm,
      };
    })
    .filter((item): item is SourceHierarchyItem => item !== null);
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value)) return 1;
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(value)), totalPages);
}

function getSpectraSortIndicator(sort: SpectraSortState, sortBy: SpectraSortBy) {
  if (sort.sortBy !== sortBy) return "↕";
  return sort.sortDirection === "asc" ? "↑" : "↓";
}

function getReturnToInfo(returnTo: string | null) {
  if (!returnTo || !returnTo.startsWith("/")) {
    return {
      href: "/search/compounds",
      label: "← Back to compound search",
    };
  }

  try {
    const parsed = new URL(returnTo, "http://localhost");
    const query = parsed.searchParams.get("query")?.trim();

    return {
      href: returnTo,
      label: query ? `← Back to results for “${query}”` : "← Back to compound search",
    };
  } catch {
    return {
      href: "/search/compounds",
      label: "← Back to compound search",
    };
  }
}

type CompoundDetailClientProps = {
  accession: string;
};

export function CompoundDetailClient({ accession }: CompoundDetailClientProps) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const returnToInfo = useMemo(() => getReturnToInfo(returnTo), [returnTo]);

  const [compound, setCompound] = useState<CompoundDetail | null>(null);
  const [compoundError, setCompoundError] = useState<string | null>(null);
  const [isCompoundLoading, setIsCompoundLoading] = useState(true);

  const [spectraRows, setSpectraRows] = useState<SpectrumRow[]>([]);
  const [spectraPagination, setSpectraPagination] = useState<PaginationMeta | null>(null);
  const [spectraError, setSpectraError] = useState<string | null>(null);
  const [isSpectraLoading, setIsSpectraLoading] = useState(false);
  const [spectraPage, setSpectraPage] = useState(1);
  const [spectraPageInput, setSpectraPageInput] = useState("1");
  const [spectraLimit, setSpectraLimit] = useState<LimitOption>(10);
  const [spectrumKind, setSpectrumKind] = useState<SpectrumKind>("both");
  const [polarity, setPolarity] = useState<SpectrumPolarity>("both");
  const [collisionMinDraft, setCollisionMinDraft] = useState("");
  const [collisionMaxDraft, setCollisionMaxDraft] = useState("");
  const [collisionMin, setCollisionMin] = useState("");
  const [collisionMax, setCollisionMax] = useState("");
  const [spectraSort, setSpectraSort] = useState<SpectraSortState>({
    sortBy: null,
    sortDirection: "asc",
  });

  const [showAdducts, setShowAdducts] = useState(false);
  const [adductRows, setAdductRows] = useState<CompoundAdductRow[]>([]);
  const [adductsLoaded, setAdductsLoaded] = useState(false);
  const [isAdductsLoading, setIsAdductsLoading] = useState(false);
  const [adductsError, setAdductsError] = useState<string | null>(null);

  const normalizedAccession = accession.trim().toUpperCase();
  const sourceHierarchy = useMemo(
    () => normalizeSourceHierarchy(compound?.sourcesHierarchy),
    [compound?.sourcesHierarchy]
  );
  const spectraTotalPages = spectraPagination?.totalPages ?? 0;
  const canNavigateSpectra = spectraTotalPages > 0 && !isSpectraLoading;
  const metaboliteUrl = `${HMDB_BASE_URL}/metabolites/${normalizedAccession}`;

  useEffect(() => {
    const abortController = new AbortController();

    async function loadCompound() {
      setIsCompoundLoading(true);
      setCompoundError(null);

      try {
        const data = await fetchJson<CompoundDetailResponse>(
          `/api/compounds/${encodeURIComponent(normalizedAccession)}`,
          abortController.signal
        );
        setCompound(data.compound);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCompound(null);
        setCompoundError(error instanceof Error ? error.message : "Failed to load compound");
      } finally {
        if (!abortController.signal.aborted) setIsCompoundLoading(false);
      }
    }

    loadCompound();
    return () => abortController.abort();
  }, [normalizedAccession]);

  useEffect(() => {
    setSpectraPageInput(String(spectraPage));
  }, [spectraPage]);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadSpectra() {
      setIsSpectraLoading(true);
      setSpectraError(null);

      try {
        const params = new URLSearchParams({
          page: String(spectraPage),
          limit: String(spectraLimit),
          spectrumKind,
          polarity,
        });

        if (collisionMin.trim()) params.set("collisionMin", collisionMin.trim());
        if (collisionMax.trim()) params.set("collisionMax", collisionMax.trim());
        if (spectraSort.sortBy) {
          params.set("sortBy", spectraSort.sortBy);
          params.set("sortDirection", spectraSort.sortDirection);
        }

        const data = await fetchJson<PaginatedSpectraResponse>(
          `/api/compounds/${encodeURIComponent(normalizedAccession)}/spectra?${params.toString()}`,
          abortController.signal
        );

        setSpectraRows(data.rows);
        setSpectraPagination(data.pagination);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSpectraRows([]);
        setSpectraPagination(null);
        setSpectraError(error instanceof Error ? error.message : "Failed to load spectra");
      } finally {
        if (!abortController.signal.aborted) setIsSpectraLoading(false);
      }
    }

    loadSpectra();
    return () => abortController.abort();
  }, [
    normalizedAccession,
    spectraLimit,
    spectraPage,
    spectrumKind,
    polarity,
    collisionMin,
    collisionMax,
    spectraSort.sortBy,
    spectraSort.sortDirection,
  ]);

  useEffect(() => {
    setShowAdducts(false);
    setAdductRows([]);
    setAdductsLoaded(false);
    setIsAdductsLoading(false);
    setAdductsError(null);
  }, [normalizedAccession]);

  async function toggleAdducts() {
    const nextShowAdducts = !showAdducts;
    setShowAdducts(nextShowAdducts);

    if (!nextShowAdducts || adductsLoaded || !compound) return;

    setIsAdductsLoading(true);
    setAdductsError(null);

    try {
      const rows = await fetchJson<CompoundAdductRow[]>(
        `/api/compounds/${encodeURIComponent(normalizedAccession)}/adducts`
      );
      setAdductRows(rows);
      setAdductsLoaded(true);
    } catch (error) {
      setAdductRows([]);
      setAdductsError(error instanceof Error ? error.message : "Failed to load compound adducts");
    } finally {
      setIsAdductsLoading(false);
    }
  }

  function goToSpectraPage(nextPage: number) {
    const safePage = clampPage(nextPage, spectraTotalPages);
    setSpectraPage(safePage);
    setSpectraPageInput(String(safePage));
  }

  function handleSpectraLimitChange(value: string) {
    const nextLimit = Number(value) as LimitOption;
    if (!LIMIT_OPTIONS.includes(nextLimit)) return;

    setSpectraLimit(nextLimit);
    setSpectraPage(1);
    setSpectraPageInput("1");
  }

  function handleSpectraPageJumpFromControls() {
    if (!canNavigateSpectra) return;
    goToSpectraPage(Number(spectraPageInput));
  }

  function handleSpectraSort(nextSortBy: SpectraSortBy) {
    setSpectraSort((current) => ({
      sortBy: nextSortBy,
      sortDirection: current.sortBy === nextSortBy && current.sortDirection === "asc" ? "desc" : "asc",
    }));
    setSpectraPage(1);
    setSpectraPageInput("1");
  }

  function applyCollisionFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setCollisionMin(collisionMinDraft.trim());
    setCollisionMax(collisionMaxDraft.trim());
    setSpectraPage(1);
    setSpectraPageInput("1");
  }

  function clearSpectraFilters() {
    setSpectrumKind("both");
    setPolarity("both");
    setCollisionMinDraft("");
    setCollisionMaxDraft("");
    setCollisionMin("");
    setCollisionMax("");
    setSpectraSort({ sortBy: null, sortDirection: "asc" });
    setSpectraPage(1);
    setSpectraPageInput("1");
    setSpectraSort({ sortBy: null, sortDirection: "asc" });
  }

  function resetSpectraSort() {
    setSpectraSort({ sortBy: null, sortDirection: "asc" });
    setSpectraPage(1);
    setSpectraPageInput("1");
  }

  function SpectraSortButton(props: { sortBy: SpectraSortBy; children: ReactNode }) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => handleSpectraSort(props.sortBy)}
      >
        <span>{props.children}</span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {getSpectraSortIndicator(spectraSort, props.sortBy)}
        </span>
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.10),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef7f8)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="outline" className="w-fit">
            <Link href={returnToInfo.href}>{returnToInfo.label}</Link>
          </Button>
          <Button asChild variant="outline" className="w-fit">
            <a href={metaboliteUrl} target="_blank" rel="noreferrer">
              View on HMDB
            </a>
          </Button>
        </div>

        <SectionPanel variant="glass">
          {isCompoundLoading ? (
            <div className="text-sm text-slate-600">Loading compound...</div>
          ) : compoundError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {compoundError}
            </div>
          ) : compound ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                    {compound.accession}
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{compound.name}</h1>
                </div>

                <Button type="button" variant="outline" className="w-fit" onClick={toggleAdducts}>
                  {showAdducts ? "Hide adducts" : "View adducts"}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Formula</dt>
                  <dd className="mt-1 font-medium text-slate-950">
                    <ChemicalFormula formula={compound.chemicalFormula} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Monoisotopic MW</dt>
                  <dd className="mt-1 font-mono text-sm tabular-nums text-slate-950">
                    {formatNullableNumber(compound.monoisotopicMolecularWeight)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Average MW</dt>
                  <dd className="mt-1 font-mono text-sm tabular-nums text-slate-950">
                    {formatNullableNumber(compound.averageMolecularWeight)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Internal ID</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm text-slate-950">
                    <span>{compound.compoundId}</span>
                  </dd>
                </div>
              </div>
            </div>
          ) : null}
        </SectionPanel>

        {compound && showAdducts ? (
          <SectionPanel>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Theoretical Adduct m/z</h2>
                <p className="text-sm text-slate-600">
                  Precomputed theoretical adduct m/z values for this compound. Disabled adducts are shown for
                  verification but may not be used in search.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                {adductRows.length} adduct{adductRows.length === 1 ? "" : "s"}
              </div>
            </div>

            {isAdductsLoading ? (
              <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-500">Loading adducts...</div>
            ) : adductsError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {adductsError}
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <Table className="table-fixed">
                  <TableHeader className="bg-cyan-950/5">
                    <TableRow>
                      <TableHead className="w-40">Adduct</TableHead>
                      <TableHead className="w-32">Ion Mode</TableHead>
                      <TableHead className="w-40">Theoretical m/z</TableHead>
                      <TableHead className="w-28">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adductRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                          No computed adducts found for this compound.
                        </TableCell>
                      </TableRow>
                    ) : (
                      adductRows.map((row) => (
                        <TableRow key={row.adductId}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell>{row.ionMode}</TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {formatNullableNumber(row.theoreticalMz)}
                          </TableCell>
                          <TableCell>{row.enabled ? "Yes" : "No"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionPanel>
        ) : null}

        {compound ? (
          <SectionPanel>
            <h2 className="text-lg font-semibold text-slate-950">Names</h2>
            <dl className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">IUPAC name</dt>
                <dd className="mt-1 text-sm text-slate-900">{formatNullableText(compound.iupacName)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Traditional IUPAC</dt>
                <dd className="mt-1 text-sm text-slate-900">{formatNullableText(compound.traditionalIupac)}</dd>
              </div>
            </dl>
          </SectionPanel>
        ) : null}

        {compound ? (
          <SectionPanel>
            <h2 className="text-lg font-semibold text-slate-950">Source</h2>
            {sourceHierarchy.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No source hierarchy available.</p>
            ) : (
              <div className="mt-4 space-y-1 text-sm text-slate-900">
                {sourceHierarchy.map((item, index) => {
                  const indentRem = Math.max(0, item.level - 1) * 1.5;
                  return (
                    <div
                      key={`${item.term}-${item.level}-${index}`}
                      className="leading-6"
                      style={{ marginLeft: `${indentRem}rem` }}
                    >
                      {item.level > 1 ? <span className="mr-2 text-slate-400">◦</span> : null}
                      <span className={item.level === 1 ? "font-medium" : undefined}>{item.term}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionPanel>
        ) : null}

        <SectionPanel>
          <div className="mb-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Related Spectra</h2>
                <p className="text-sm text-slate-600">
                  Diagnostic MS/MS spectra metadata linked to this compound.
                  {spectraSort.sortBy ? (
                    <span>
                      {" "}
                      Sorted by {spectraSort.sortBy} {spectraSort.sortDirection}.
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {spectraSort.sortBy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9"
                    disabled={isSpectraLoading}
                    onClick={resetSpectraSort}
                  >
                    Reset sort
                  </Button>
                ) : null}

                <Button type="button" variant="outline" className="h-9" onClick={clearSpectraFilters}>
                  Clear filters
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-cyan-900/10 bg-cyan-950/2.5 p-3">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[150px_150px_130px_130px_auto_90px] xl:items-end">
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Type</span>
                  <Select
                    value={spectrumKind}
                    onValueChange={(value) => {
                      setSpectrumKind(value as SpectrumKind);
                      setSpectraPage(1);
                      setSpectraPageInput("1");
                    }}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Both</SelectItem>
                      <SelectItem value="experimental">Experimental</SelectItem>
                      <SelectItem value="predicted">Predicted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Polarity</span>
                  <Select
                    value={polarity}
                    onValueChange={(value) => {
                      setPolarity(value as SpectrumPolarity);
                      setSpectraPage(1);
                      setSpectraPageInput("1");
                    }}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Both</SelectItem>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <form id="spectra-collision-filter-form" className="contents" onSubmit={applyCollisionFilters}>
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Collision min</span>
                    <Input
                      value={collisionMinDraft}
                      onChange={(event) => setCollisionMinDraft(event.target.value)}
                      inputMode="decimal"
                      className="h-10 w-full"
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Collision max</span>
                    <Input
                      value={collisionMaxDraft}
                      onChange={(event) => setCollisionMaxDraft(event.target.value)}
                      inputMode="decimal"
                      className="h-10 w-full"
                      placeholder="50"
                    />
                  </div>
                </form>

                <div className="flex h-10 items-center gap-2 self-end">
                  <Button type="submit" form="spectra-collision-filter-form" variant="outline" className="h-10">
                    Apply
                  </Button>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows</span>
                  <Select value={String(spectraLimit)} onValueChange={handleSpectraLimitChange}>
                    <SelectTrigger className="h-10 w-full">
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
            </div>
          </div>

          {spectraError ? (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {spectraError}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border">
            <Table className="table-fixed">
              <TableHeader className="bg-cyan-950/5">
                <TableRow>
                  <TableHead className="w-25">
                    <SpectraSortButton sortBy="hmdbSpectrumId">HMDB ID</SpectraSortButton>
                  </TableHead>
                  <TableHead className="w-26.25">Type</TableHead>
                  <TableHead className="w-22.5">
                    <SpectraSortButton sortBy="polarity">Polarity</SpectraSortButton>
                  </TableHead>
                  <TableHead className="w-52.5">Instrument</TableHead>
                  <TableHead className="w-27.5">
                    <SpectraSortButton sortBy="collisionEnergyVoltage">Collision</SpectraSortButton>
                  </TableHead>
                  <TableHead className="w-20">
                    <SpectraSortButton sortBy="peakCounter">Peaks</SpectraSortButton>
                  </TableHead>
                  <TableHead className="w-52.5">Splash</TableHead>
                  <TableHead className="w-20">HMDB</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isSpectraLoading && spectraRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                      Loading spectra...
                    </TableCell>
                  </TableRow>
                ) : spectraRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                      No related spectra found.
                    </TableCell>
                  </TableRow>
                ) : (
                  spectraRows.map((row) => {
                    const spectrumUrl = `${HMDB_BASE_URL}/spectra/ms_ms/${row.hmdbSpectrumId}`;
                    return (
                      <TableRow key={`${row.compoundId}-${row.hmdbSpectrumId}-${row.spectrumId}`}>
                        <TableCell className="w-25 truncate font-mono text-xs">
                          <Link
                            href={`/spectra/ms-ms/${row.hmdbSpectrumId}?returnTo=${encodeURIComponent(
                              `/compounds/${normalizedAccession}`
                            )}`}
                            className="text-cyan-800 underline-offset-4 hover:underline"
                          >
                            {row.hmdbSpectrumId}
                          </Link>
                        </TableCell>
                        <TableCell className="w-26.25 truncate">
                          {row.predicted ? "Predicted" : "Experimental"}
                        </TableCell>
                        <TableCell className="w-22.5 truncate">{row.polarity ?? "—"}</TableCell>
                        <TableCell className="w-52.5 truncate" title={row.instrumentType ?? undefined}>
                          {row.instrumentType ?? "—"}
                        </TableCell>
                        <TableCell className="w-27.5 font-mono text-xs tabular-nums">
                          {formatNullableNumber(row.collisionEnergyVoltage)}
                        </TableCell>
                        <TableCell className="w-20 font-mono text-xs tabular-nums">
                          {formatNullableNumber(row.peakCounter)}
                        </TableCell>
                        <TableCell className="w-52.5 truncate font-mono text-xs" title={row.splashKey ?? undefined}>
                          {row.splashKey ?? "—"}
                        </TableCell>
                        <TableCell className="w-20">
                          <Button asChild variant="outline" size="sm">
                            <a href={spectrumUrl} target="_blank" rel="noreferrer">
                              HMDB
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={spectraPagination?.page ?? spectraPage}
            totalPages={spectraPagination?.totalPages ?? 0}
            totalRows={spectraPagination?.totalRows}
            pageInput={spectraPageInput}
            isLoading={isSpectraLoading}
            hasPreviousPage={spectraPagination?.hasPreviousPage ?? false}
            hasNextPage={spectraPagination?.hasNextPage ?? false}
            onPageInputChange={setSpectraPageInput}
            onPageJump={handleSpectraPageJumpFromControls}
            onPageChange={goToSpectraPage}
          />
        </SectionPanel>
      </div>
    </main>
  );
}
