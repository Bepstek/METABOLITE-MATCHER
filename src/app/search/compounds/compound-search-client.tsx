"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { ChemicalFormula } from "@/components/chemical-formula";
import { buildErrorMessage } from "@/lib/api-client";
import { SectionPanel } from "../../../components/section-panel";
import { PaginationControls } from "../../../components/pagination-controls";
import { formatNullableNumber } from "@/lib/format";

type CompoundSearchRow = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  averageMolecularWeight: number | null;
  monoisotopicMolecularWeight: number | null;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type CompoundSearchResponse = {
  rows: CompoundSearchRow[];
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

const LIMIT_OPTIONS = [10, 25, 50, 100] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

type CompoundSortBy = "accession" | "name" | "monoisotopicMolecularWeight" | "averageMolecularWeight";

const COMPOUND_SORT_OPTIONS = [
  "accession",
  "name",
  "monoisotopicMolecularWeight",
  "averageMolecularWeight",
] as const satisfies readonly CompoundSortBy[];

type SortDirection = "asc" | "desc";

type SortState = {
  sortBy: CompoundSortBy | null;
  sortDirection: SortDirection;
};

function isLimitOption(value: number): value is LimitOption {
  return LIMIT_OPTIONS.includes(value as LimitOption);
}

function parseLimit(value: string | null): LimitOption {
  const parsed = Number(value);
  return isLimitOption(parsed) ? parsed : 10;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

function parseSortBy(value: string | null): CompoundSortBy | null {
  if (COMPOUND_SORT_OPTIONS.includes(value as CompoundSortBy)) {
    return value as CompoundSortBy;
  }

  return null;
}

function parseSortDirection(value: string | null): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

function getSortIndicator(sort: SortState, sortBy: CompoundSortBy) {
  if (sort.sortBy !== sortBy) return "↕";
  return sort.sortDirection === "asc" ? "↑" : "↓";
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value)) return 1;
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(value)), totalPages);
}

export function CompoundSearchClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [limit, setLimit] = useState<LimitOption>(10);
  const [sort, setSort] = useState<SortState>({
    sortBy: null,
    sortDirection: "asc",
  });
  const [rows, setRows] = useState<CompoundSearchRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextQuery = searchParams.get("query")?.trim() ?? "";
    const nextPage = parsePositiveInt(searchParams.get("page"), 1);
    const nextLimit = parseLimit(searchParams.get("limit"));
    const nextSortBy = parseSortBy(searchParams.get("sortBy"));
    const nextSortDirection = parseSortDirection(searchParams.get("sortDirection"));

    setDraftQuery(nextQuery);
    setQuery(nextQuery);
    setPage(nextPage);
    setPageInput(String(nextPage));
    setLimit(nextLimit);
    setSort({
      sortBy: nextSortBy,
      sortDirection: nextSortDirection,
    });
  }, [searchParams]);

  const trimmedDraftQuery = draftQuery.trim();
  const hasSubmittedQuery = query.length > 0;
  const totalPages = pagination?.totalPages ?? 0;
  const canNavigate = hasSubmittedQuery && totalPages > 0 && !isLoading;

  const currentReturnTo = useMemo(() => {
    const currentParams = searchParams.toString();
    return currentParams ? `${pathname}?${currentParams}` : pathname;
  }, [pathname, searchParams]);

  const resultSummary = useMemo(() => {
    if (!pagination) return null;

    if (pagination.totalRows === 0) {
      return "No results";
    }

    const start = (pagination.page - 1) * pagination.pageSize + 1;
    const end = Math.min(pagination.page * pagination.pageSize, pagination.totalRows);

    return `${start}-${end} of ${pagination.totalRows}`;
  }, [pagination]);

  function buildSearchUrl(input: {
    query: string;
    page: number;
    limit: LimitOption;
    sortBy: CompoundSortBy | null;
    sortDirection: SortDirection;
  }) {
    const params = new URLSearchParams();
    const nextQuery = input.query.trim();

    if (nextQuery) params.set("query", nextQuery);
    params.set("page", String(input.page));
    params.set("limit", String(input.limit));

    if (input.sortBy) {
      params.set("sortBy", input.sortBy);
      params.set("sortDirection", input.sortDirection);
    }

    return `${pathname}?${params.toString()}`;
  }

  function pushSearchState(input: {
    query: string;
    page: number;
    limit: LimitOption;
    sortBy: CompoundSortBy | null;
    sortDirection: SortDirection;
  }) {
    router.push(buildSearchUrl(input), { scroll: false });
  }

  function replaceSearchState(input: {
    query: string;
    page: number;
    limit: LimitOption;
    sortBy: CompoundSortBy | null;
    sortDirection: SortDirection;
  }) {
    router.replace(buildSearchUrl(input), { scroll: false });
  }

  useEffect(() => {
    if (!hasSubmittedQuery) {
      setRows([]);
      setPagination(null);
      setErrorMessage(null);
      return;
    }

    const abortController = new AbortController();

    async function runSearch() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({
          query,
          page: String(page),
          limit: String(limit),
        });

        if (sort.sortBy) {
          params.set("sortBy", sort.sortBy);
          params.set("sortDirection", sort.sortDirection);
        }

        const response = await fetch(`/api/compounds/search?${params.toString()}`, { signal: abortController.signal });

        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(buildErrorMessage(payload, `Search failed with status ${response.status}`));
        }

        const data = payload as CompoundSearchResponse;
        setRows(data.rows);
        setPagination(data.pagination);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRows([]);
        setPagination(null);
        setErrorMessage(error instanceof Error ? error.message : "Search failed");
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    runSearch();

    return () => {
      abortController.abort();
    };
  }, [hasSubmittedQuery, limit, page, query, sort.sortBy, sort.sortDirection]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedDraftQuery) {
      router.push(pathname, { scroll: false });
      return;
    }

    pushSearchState({
      query: trimmedDraftQuery,
      page: 1,
      limit,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    });
  }

  function handleLimitChange(value: string) {
    const nextLimit = Number(value) as LimitOption;

    if (!LIMIT_OPTIONS.includes(nextLimit)) return;

    replaceSearchState({
      query,
      page: 1,
      limit: nextLimit,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    });
  }

  function handleSort(nextSortBy: CompoundSortBy) {
    const nextSort: SortState =
      sort.sortBy !== nextSortBy
        ? { sortBy: nextSortBy, sortDirection: "asc" }
        : {
            sortBy: nextSortBy,
            sortDirection: sort.sortDirection === "asc" ? "desc" : "asc",
          };

    replaceSearchState({
      query,
      page: 1,
      limit,
      sortBy: nextSort.sortBy,
      sortDirection: nextSort.sortDirection,
    });
  }

  function goToPage(nextPage: number) {
    const safePage = clampPage(nextPage, totalPages);
    replaceSearchState({
      query,
      page: safePage,
      limit,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    });
  }

  function handlePageJump(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canNavigate) return;

    const requestedPage = Number(pageInput);
    goToPage(requestedPage);
  }

  function handlePageJumpFromControls() {
    if (!canNavigate) return;

    const requestedPage = Number(pageInput);
    goToPage(requestedPage);
  }

  function resetSort() {
    replaceSearchState({
      query,
      page: 1,
      limit,
      sortBy: null,
      sortDirection: "asc",
    });
  }

  function SortButton(props: { sortBy: CompoundSortBy; children: ReactNode; className?: string }) {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 text-left font-medium text-primary underline-offset-4 hover:underline ${
          props.className ?? ""
        }`}
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.10),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef7f8)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <SectionPanel variant="glass">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">HMDB-like Search</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Compound Search</h1>
              <p className="text-sm text-slate-600">
                Search compounds by HMDB compound name. Accession lookup and mass searches are handled by separate
                search modes.
              </p>
            </div>

            <Button asChild variant="outline" className="w-fit">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </SectionPanel>

        <SectionPanel>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <Input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Example: Creatine"
              aria-label="Compound name"
              className="sm:max-w-md"
            />
            <Button type="submit" disabled={isLoading || trimmedDraftQuery.length === 0}>
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </form>
        </SectionPanel>

        <SectionPanel>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              {hasSubmittedQuery ? (
                <span>
                  Results for <span className="font-medium text-slate-950">{query}</span>
                  {resultSummary ? ` · ${resultSummary}` : null}
                  {sort.sortBy ? ` · Sorted by ${sort.sortBy} ${sort.sortDirection}` : " · Relevance order"}
                </span>
              ) : (
                <span>Enter a compound name to search.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sort.sortBy ? (
                <Button type="button" variant="ghost" disabled={isLoading} onClick={resetSort} className="h-9">
                  Reset sort
                </Button>
              ) : null}

              <span className="text-sm text-slate-600">Rows</span>

              <Select value={String(limit)} onValueChange={handleLimitChange}>
                <SelectTrigger className="w-24">
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

          {errorMessage ? (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border">
            <Table className="table-fixed">
              <TableHeader className="bg-cyan-950/5">
                <TableRow>
                  <TableHead className="w-37.5">
                    <SortButton sortBy="accession">Accession</SortButton>
                  </TableHead>
                  <TableHead className="w-80 max-w-80">
                    <SortButton sortBy="name">Name</SortButton>
                  </TableHead>
                  <TableHead className="w-30">Formula</TableHead>
                  <TableHead className="w-42.5 text-left">
                    <SortButton sortBy="monoisotopicMolecularWeight">Monoisotopic MW</SortButton>
                  </TableHead>
                  <TableHead className="w-37.5 text-left">
                    <SortButton sortBy="averageMolecularWeight">Average MW</SortButton>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {!hasSubmittedQuery ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                      Enter a compound name and click Search.
                    </TableCell>
                  </TableRow>
                ) : isLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                      Loading results...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                      No compounds found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const href = `/compounds/${row.accession}?returnTo=${encodeURIComponent(currentReturnTo)}`;

                    return (
                      <TableRow key={row.accession}>
                        <TableCell className="w-37.5 truncate font-mono text-xs font-medium">
                          <Link
                            href={href}
                            className="text-cyan-800 underline-offset-4 hover:underline"
                            title={row.accession}
                          >
                            {row.accession}
                          </Link>
                        </TableCell>
                        <TableCell className="w-80 max-w-80 truncate font-medium text-slate-900" title={row.name}>
                          {row.name}
                        </TableCell>
                        <TableCell
                          className="w-30 truncate whitespace-nowrap font-medium text-slate-800"
                          title={row.chemicalFormula ?? undefined}
                        >
                          <ChemicalFormula formula={row.chemicalFormula} />
                        </TableCell>
                        <TableCell className="w-42.5 text-left font-mono text-xs tabular-nums">
                          {formatNullableNumber(row.monoisotopicMolecularWeight)}
                        </TableCell>
                        <TableCell className="w-37.5 text-left font-mono text-xs tabular-nums">
                          {formatNullableNumber(row.averageMolecularWeight)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={pagination?.page ?? page}
            totalPages={pagination?.totalPages ?? 0}
            totalRows={pagination?.totalRows}
            pageInput={pageInput}
            isLoading={isLoading}
            hasPreviousPage={pagination?.hasPreviousPage ?? false}
            hasNextPage={pagination?.hasNextPage ?? false}
            onPageInputChange={setPageInput}
            onPageJump={handlePageJumpFromControls}
            onPageChange={goToPage}
          />
        </SectionPanel>
      </div>
    </main>
  );
}
