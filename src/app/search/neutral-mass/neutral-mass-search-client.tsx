"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChemicalFormula } from "../../../components/chemical-formula";
import { PaginationControls } from "../../../components/pagination-controls";
import { SectionPanel } from "../../../components/section-panel";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { fetchJson } from "../../../lib/api-client";
import { formatDeltaPpm, formatNullableNumber } from "../../../lib/format";

type ToleranceUnit = "ppm" | "da";

type SourceTermOption = {
  id: number;
  name: string;
};

type NeutralMassRow = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  monoisotopicMolecularWeight: number | null;
  averageMolecularWeight: number | null;
  massErrorDa: number;
  massErrorPpm: number;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type NeutralMassResponse = {
  rows: NeutralMassRow[];
  pagination: PaginationMeta;
};

type MassResultState = {
  queryMass: number;
  page: number;
  pageInput: string;
  rows: NeutralMassRow[];
  pagination: PaginationMeta | null;
  isLoading: boolean;
  errorMessage: string | null;
};

const LIMIT_OPTIONS = [10, 25, 50, 100] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

const MAX_MASS_SECTIONS = 10;

type NeutralMassSortBy =
  | "accession"
  | "name"
  | "chemicalFormula"
  | "monoisotopicMolecularWeight"
  | "averageMolecularWeight"
  | "massErrorPpm";

const NEUTRAL_MASS_SORT_OPTIONS = [
  "accession",
  "name",
  "chemicalFormula",
  "monoisotopicMolecularWeight",
  "averageMolecularWeight",
  "massErrorPpm",
] as const satisfies readonly NeutralMassSortBy[];

type SortDirection = "asc" | "desc";

type SortState = {
  sortBy: NeutralMassSortBy | null;
  sortDirection: SortDirection;
};

function isLimitOption(value: number): value is LimitOption {
  return LIMIT_OPTIONS.includes(value as LimitOption);
}

function parseLimit(value: string | null): LimitOption {
  const parsed = Number(value);
  return isLimitOption(parsed) ? parsed : 10;
}

function parseToleranceUnit(value: string | null): ToleranceUnit {
  return value === "da" ? "da" : "ppm";
}

function parseSourceTermId(value: string | null) {
  if (!value || value === "any") return "any";
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : "any";
}

function parseSortBy(value: string | null): NeutralMassSortBy | null {
  if (NEUTRAL_MASS_SORT_OPTIONS.includes(value as NeutralMassSortBy)) {
    return value as NeutralMassSortBy;
  }

  return null;
}

function parseSortDirection(value: string | null): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

function parseQueryMassValues(value: string) {
  const seen = new Set<string>();
  const allValues: number[] = [];

  value.split(/\r?\n/).forEach((line) => {
    const firstToken = line
      .split(/[\s,;]+/)
      .find((token) => token.trim().length > 0);
    if (!firstToken) return;

    const parsed = Number(firstToken.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const key = String(parsed);
    if (seen.has(key)) return;

    seen.add(key);
    allValues.push(parsed);
  });

  return allValues;
}

function getMassKey(queryMass: number) {
  return String(queryMass);
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value)) return 1;
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(value)), totalPages);
}

function getSortIndicator(sort: SortState, sortBy: NeutralMassSortBy) {
  if (sort.sortBy !== sortBy) return "↕";
  return sort.sortDirection === "asc" ? "↑" : "↓";
}

function buildEmptyMassResult(queryMass: number): MassResultState {
  return {
    queryMass,
    page: 1,
    pageInput: "1",
    rows: [],
    pagination: null,
    isLoading: true,
    errorMessage: null,
  };
}

export function NeutralMassSearchClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [queryMassValuesDraft, setQueryMassValuesDraft] = useState("");
  const [queryMassValues, setQueryMassValues] = useState("");

  const [toleranceDraft, setToleranceDraft] = useState("10");
  const [tolerance, setTolerance] = useState("10");

  const [toleranceUnitDraft, setToleranceUnitDraft] =
    useState<ToleranceUnit>("ppm");
  const [toleranceUnit, setToleranceUnit] = useState<ToleranceUnit>("ppm");

  const [sourceTermIdDraft, setSourceTermIdDraft] = useState("any");
  const [sourceTermId, setSourceTermId] = useState("any");

  const [limitDraft, setLimitDraft] = useState<LimitOption>(10);
  const [limit, setLimit] = useState<LimitOption>(10);

  const [sort, setSort] = useState<SortState>({
    sortBy: null,
    sortDirection: "asc",
  });

  const [sourceTerms, setSourceTerms] = useState<SourceTermOption[]>([]);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [massResults, setMassResults] = useState<Record<string, MassResultState>>(
    {},
  );

  useEffect(() => {
    const nextQueryMassValues = searchParams.get("queryMassValues") ?? "";
    const nextTolerance = searchParams.get("tolerance") ?? "10";
    const nextToleranceUnit = parseToleranceUnit(searchParams.get("toleranceUnit"));
    const nextSourceTermId = parseSourceTermId(searchParams.get("sourceTermId"));
    const nextLimit = parseLimit(searchParams.get("limit"));
    const nextSortBy = parseSortBy(searchParams.get("sortBy"));
    const nextSortDirection = parseSortDirection(searchParams.get("sortDirection"));

    setQueryMassValuesDraft(nextQueryMassValues);
    setQueryMassValues(nextQueryMassValues);

    setToleranceDraft(nextTolerance);
    setTolerance(nextTolerance);

    setToleranceUnitDraft(nextToleranceUnit);
    setToleranceUnit(nextToleranceUnit);

    setSourceTermIdDraft(nextSourceTermId);
    setSourceTermId(nextSourceTermId);

    setLimitDraft(nextLimit);
    setLimit(nextLimit);

    setSort({ sortBy: nextSortBy, sortDirection: nextSortDirection });
  }, [searchParams]);

  const allParsedMassValues = useMemo(
    () => parseQueryMassValues(queryMassValues),
    [queryMassValues],
  );

  const parsedMassValues = useMemo(
    () => allParsedMassValues.slice(0, MAX_MASS_SECTIONS),
    [allParsedMassValues],
  );

  const skippedMassCount = Math.max(
    0,
    allParsedMassValues.length - parsedMassValues.length,
  );
  const hasSubmittedQuery = parsedMassValues.length > 0;

  const buildApiUrl = useCallback(
    (queryMass: number, page: number) => {
      const apiParams = new URLSearchParams({
        queryMass: String(queryMass),
        page: String(page),
        limit: String(limit),
      });

      const trimmedTolerance = tolerance.trim();
      if (trimmedTolerance) {
        apiParams.set("tolerance", trimmedTolerance);
        apiParams.set("toleranceUnit", toleranceUnit);
      }

      if (sourceTermId !== "any") apiParams.set("sourceTermId", sourceTermId);

      if (sort.sortBy) {
        apiParams.set("sortBy", sort.sortBy);
        apiParams.set("sortDirection", sort.sortDirection);
      }

      return `/api/search/neutral-mass?${apiParams.toString()}`;
    },
    [
      limit,
      sourceTermId,
      sort.sortBy,
      sort.sortDirection,
      tolerance,
      toleranceUnit,
    ],
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function loadMetadata() {
      setMetadataError(null);

      try {
        const sources = await fetchJson<SourceTermOption[]>(
          "/api/metadata/source-terms",
          abortController.signal,
        );

        setSourceTerms(sources);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMetadataError(
          error instanceof Error ? error.message : "Failed to load metadata",
        );
      }
    }

    loadMetadata();

    return () => {
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    if (!hasSubmittedQuery) {
      setMassResults({});
      return;
    }

    const abortController = new AbortController();
    const nextInitialResults = Object.fromEntries(
      parsedMassValues.map((queryMass) => [
        getMassKey(queryMass),
        buildEmptyMassResult(queryMass),
      ]),
    );

    setMassResults(nextInitialResults);

    parsedMassValues.forEach(async (queryMass) => {
      const key = getMassKey(queryMass);

      try {
        const data = await fetchJson<NeutralMassResponse>(
          buildApiUrl(queryMass, 1),
          abortController.signal,
        );

        setMassResults((current) => ({
          ...current,
          [key]: {
            queryMass,
            page: data.pagination.page,
            pageInput: String(data.pagination.page),
            rows: data.rows,
            pagination: data.pagination,
            isLoading: false,
            errorMessage: null,
          },
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;

        setMassResults((current) => ({
          ...current,
          [key]: {
            queryMass,
            page: 1,
            pageInput: "1",
            rows: [],
            pagination: null,
            isLoading: false,
            errorMessage: error instanceof Error ? error.message : "Search failed",
          },
        }));
      }
    });

    return () => {
      abortController.abort();
    };
  }, [buildApiUrl, hasSubmittedQuery, parsedMassValues]);

  function buildSearchUrl(input: {
    queryMassValues: string;
    tolerance: string;
    toleranceUnit: ToleranceUnit;
    sourceTermId: string;
    limit: LimitOption;
    sortBy: NeutralMassSortBy | null;
    sortDirection: SortDirection;
  }) {
    const params = new URLSearchParams();
    const trimmedQueryMassValues = input.queryMassValues.trim();
    const trimmedTolerance = input.tolerance.trim();

    if (trimmedQueryMassValues) params.set("queryMassValues", trimmedQueryMassValues);
    if (trimmedTolerance) params.set("tolerance", trimmedTolerance);
    params.set("toleranceUnit", input.toleranceUnit);
    if (input.sourceTermId !== "any") params.set("sourceTermId", input.sourceTermId);
    params.set("limit", String(input.limit));

    if (input.sortBy) {
      params.set("sortBy", input.sortBy);
      params.set("sortDirection", input.sortDirection);
    }

    return `${pathname}?${params.toString()}`;
  }

  function pushSearchState(input: {
    queryMassValues: string;
    tolerance: string;
    toleranceUnit: ToleranceUnit;
    sourceTermId: string;
    limit: LimitOption;
    sortBy: NeutralMassSortBy | null;
    sortDirection: SortDirection;
  }) {
    router.push(buildSearchUrl(input), { scroll: false });
  }

  function replaceSearchState(input: {
    queryMassValues: string;
    tolerance: string;
    toleranceUnit: ToleranceUnit;
    sourceTermId: string;
    limit: LimitOption;
    sortBy: NeutralMassSortBy | null;
    sortDirection: SortDirection;
  }) {
    router.replace(buildSearchUrl(input), { scroll: false });
  }

  function handleSearchSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQueryMassValues = queryMassValuesDraft.trim();
    if (!trimmedQueryMassValues) {
      router.push(pathname, { scroll: false });
      return;
    }

    pushSearchState({
      queryMassValues: trimmedQueryMassValues,
      tolerance: toleranceDraft,
      toleranceUnit: toleranceUnitDraft,
      sourceTermId: sourceTermIdDraft,
      limit: limitDraft,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    });
  }

  function clearFilters() {
    setToleranceDraft("10");
    setToleranceUnitDraft("ppm");
    setSourceTermIdDraft("any");
    setLimitDraft(10);
  }

  function resetSearch() {
    setQueryMassValuesDraft("");
    router.push(pathname, { scroll: false });
  }

  function resetSort() {
    replaceSearchState({
      queryMassValues,
      tolerance,
      toleranceUnit,
      sourceTermId,
      limit,
      sortBy: null,
      sortDirection: "asc",
    });
  }

  function loadExample() {
    const exampleMasses = "132.053492132\n180.063388118\n300.12345";
    setQueryMassValuesDraft(exampleMasses);
    setToleranceDraft("10");
    setToleranceUnitDraft("ppm");
    setSourceTermIdDraft("any");
    setLimitDraft(10);

    pushSearchState({
      queryMassValues: exampleMasses,
      tolerance: "10",
      toleranceUnit: "ppm",
      sourceTermId: "any",
      limit: 10,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    });
  }

  async function goToMassPage(queryMass: number, nextPage: number) {
    const key = getMassKey(queryMass);
    const currentResult = massResults[key];
    const safePage = clampPage(nextPage, currentResult?.pagination?.totalPages ?? 1);

    setMassResults((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? buildEmptyMassResult(queryMass)),
        page: safePage,
        pageInput: String(safePage),
        isLoading: true,
        errorMessage: null,
      },
    }));

    try {
      const data = await fetchJson<NeutralMassResponse>(
        buildApiUrl(queryMass, safePage),
      );

      setMassResults((current) => ({
        ...current,
        [key]: {
          queryMass,
          page: data.pagination.page,
          pageInput: String(data.pagination.page),
          rows: data.rows,
          pagination: data.pagination,
          isLoading: false,
          errorMessage: null,
        },
      }));
    } catch (error) {
      setMassResults((current) => ({
        ...current,
        [key]: {
          ...(current[key] ?? buildEmptyMassResult(queryMass)),
          isLoading: false,
          errorMessage: error instanceof Error ? error.message : "Search failed",
        },
      }));
    }
  }

  function handleMassPageInputChange(queryMass: number, value: string) {
    const key = getMassKey(queryMass);

    setMassResults((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? buildEmptyMassResult(queryMass)),
        pageInput: value,
      },
    }));
  }

  function handleSort(nextSortBy: NeutralMassSortBy) {
    const nextSort: SortState =
      sort.sortBy !== nextSortBy
        ? { sortBy: nextSortBy, sortDirection: "asc" }
        : {
            sortBy: nextSortBy,
            sortDirection: sort.sortDirection === "asc" ? "desc" : "asc",
          };

    replaceSearchState({
      queryMassValues,
      tolerance,
      toleranceUnit,
      sourceTermId,
      limit,
      sortBy: nextSort.sortBy,
      sortDirection: nextSort.sortDirection,
    });
  }

  function SortButton(props: { sortBy: NeutralMassSortBy; children: ReactNode }) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        disabled={!hasSubmittedQuery}
        onClick={() => handleSort(props.sortBy)}
      >
        <span>{props.children}</span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {getSortIndicator(sort, props.sortBy)}
        </span>
      </button>
    );
  }

  function renderResultTable(result: MassResultState) {
    const summary = result.pagination
      ? result.pagination.totalRows === 0
        ? "No results"
        : `${(result.pagination.page - 1) * result.pagination.pageSize + 1}-${Math.min(
            result.pagination.page * result.pagination.pageSize,
            result.pagination.totalRows,
          )} of ${result.pagination.totalRows}`
      : null;

    return (
      <SectionPanel>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Results for <span className="font-mono">{result.queryMass}</span>
            </h2>
            <p className="text-sm text-slate-600">
              {summary
                ? `${summary} · Delta shown as absolute rounded ppm`
                : "Loading section summary..."}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Page {result.pagination?.page ?? result.page} of {result.pagination?.totalPages ?? "—"}
          </div>
        </div>

        {result.errorMessage ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {result.errorMessage}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-212.5 table-fixed">
            <TableHeader className="bg-cyan-950/5">
              <TableRow>
                <TableHead className="w-37.5">
                  <SortButton sortBy="accession">Compound</SortButton>
                </TableHead>
                <TableHead className="w-80">
                  <SortButton sortBy="name">Name</SortButton>
                </TableHead>
                <TableHead className="w-30">
                  <SortButton sortBy="chemicalFormula">Formula</SortButton>
                </TableHead>
                <TableHead className="w-42.5">
                  <SortButton sortBy="monoisotopicMolecularWeight">
                    Monoisotopic Mass
                  </SortButton>
                </TableHead>
                <TableHead className="w-37.5">
                  <SortButton sortBy="averageMolecularWeight">Average Mass</SortButton>
                </TableHead>
                <TableHead className="w-32">
                  <SortButton sortBy="massErrorPpm">Delta (ppm)</SortButton>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.isLoading && result.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                    Loading results...
                  </TableCell>
                </TableRow>
              ) : result.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                    No neutral mass matches found.
                  </TableCell>
                </TableRow>
              ) : (
                result.rows.map((row) => (
                  <TableRow key={`${result.queryMass}-${row.compoundId}-${row.accession}`}>
                    <TableCell className="w-37.5 truncate font-mono text-xs font-medium">
                      <Link
                        href={`/compounds/${row.accession}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-800 underline-offset-4 hover:underline"
                        title={row.accession}
                      >
                        {row.accession}
                      </Link>
                    </TableCell>
                    <TableCell className="w-80 truncate font-medium text-slate-900" title={row.name}>
                      {row.name}
                    </TableCell>
                    <TableCell className="w-30 truncate whitespace-nowrap" title={row.chemicalFormula ?? undefined}>
                      <ChemicalFormula formula={row.chemicalFormula} />
                    </TableCell>
                    <TableCell className="w-42.5 font-mono text-xs tabular-nums">
                      {formatNullableNumber(row.monoisotopicMolecularWeight)}
                    </TableCell>
                    <TableCell className="w-37.5 font-mono text-xs tabular-nums">
                      {formatNullableNumber(row.averageMolecularWeight)}
                    </TableCell>
                    <TableCell className="w-32 font-mono text-xs tabular-nums">
                      {formatDeltaPpm(row.massErrorPpm)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationControls
          page={result.pagination?.page ?? result.page}
          totalPages={result.pagination?.totalPages ?? 0}
          totalRows={result.pagination?.totalRows}
          pageInput={result.pageInput}
          isLoading={result.isLoading}
          hasPreviousPage={result.pagination?.hasPreviousPage ?? false}
          hasNextPage={result.pagination?.hasNextPage ?? false}
          onPageInputChange={(value) => handleMassPageInputChange(result.queryMass, value)}
          onPageJump={() => {
            const requestedPage = Number(result.pageInput);
            goToMassPage(result.queryMass, requestedPage);
          }}
          onPageChange={(nextPage) => goToMassPage(result.queryMass, nextPage)}
        />
      </SectionPanel>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.10),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef7f8)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <SectionPanel variant="glass">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Search Options
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Neutral Mass Search
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Search compounds directly by monoisotopic neutral mass using tolerance and source filtering.
                Multiple masses create stacked result sections with independent pagination.
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
              <label className="text-sm font-semibold text-slate-950" htmlFor="query-mass-values">
                Query neutral mass values
              </label>
              <textarea
                id="query-mass-values"
                value={queryMassValuesDraft}
                onChange={(event) => setQueryMassValuesDraft(event.target.value)}
                className="min-h-72 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder={"132.053492132\n180.063388118\n300.12345"}
              />
              <p className="text-xs text-slate-500">
                Enter one neutral monoisotopic mass per line. Up to {MAX_MASS_SECTIONS} mass sections are searched.
              </p>
              {hasSubmittedQuery ? (
                <p className="text-xs text-cyan-800">
                  Showing {parsedMassValues.length} mass section{parsedMassValues.length === 1 ? "" : "s"}.
                  {skippedMassCount > 0
                    ? ` ${skippedMassCount} extra value${skippedMassCount === 1 ? "" : "s"} skipped for now.`
                    : null}
                </p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-950">Tolerance ±</label>
                  <Input
                    value={toleranceDraft}
                    onChange={(event) => setToleranceDraft(event.target.value)}
                    inputMode="decimal"
                    placeholder="10"
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
                      <SelectItem value="ppm">ppm</SelectItem>
                      <SelectItem value="da">Da</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-950">Rows per section</label>
                <Select
                  value={String(limitDraft)}
                  onValueChange={(value) => setLimitDraft(Number(value) as LimitOption)}
                >
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

              {metadataError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {metadataError}
                </div>
              ) : null}
            </div>

            <div className="border-t border-cyan-900/10 pt-4 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={loadExample}>
                  Load Example
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={queryMassValuesDraft.trim().length === 0}>
                    Search
                  </Button>
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                  <Button type="button" variant="destructive" onClick={resetSearch}>
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </SectionPanel>

        {!hasSubmittedQuery ? (
          <SectionPanel className="text-sm text-slate-600">
            Enter neutral mass search options and click Search.
          </SectionPanel>
        ) : null}

        {hasSubmittedQuery ? (
          <SectionPanel className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                Showing {parsedMassValues.length} mass section{parsedMassValues.length === 1 ? "" : "s"}
                {sort.sortBy ? (
                  <span>
                    {" "}· Sorted by {sort.sortBy} {sort.sortDirection}
                  </span>
                ) : (
                  <span> · Default closest-match order</span>
                )}
              </div>

              {sort.sortBy ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={Object.values(massResults).some((result) => result.isLoading)}
                  onClick={resetSort}
                  className="h-9 w-fit self-start sm:self-auto"
                >
                  Reset sort
                </Button>
              ) : null}
            </div>
          </SectionPanel>
        ) : null}

        {parsedMassValues.map((queryMass) => {
          const key = getMassKey(queryMass);
          return (
            <div key={key}>
              {renderResultTable(massResults[key] ?? buildEmptyMassResult(queryMass))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
