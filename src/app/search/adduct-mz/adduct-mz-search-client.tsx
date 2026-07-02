"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { SectionPanel } from "../../../components/section-panel";
import { PaginationControls } from "../../../components/pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { ChemicalFormula } from "@/components/chemical-formula";
import { fetchJson } from "@/lib/api-client";
import { formatDeltaPpm, formatNullableNumber } from "@/lib/format";

type IonMode = "positive" | "negative";
type ToleranceUnit = "ppm" | "da";

type AdductOption = {
  id: number;
  label: string;
  ionMode: IonMode;
  charge: number;
  massMultiplier: number;
  massShift: number;
};

type SourceTermOption = {
  id: number;
  name: string;
};

type AdductMzRow = {
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  monoisotopicMolecularWeight: number | null;
  averageMolecularWeight: number | null;
  adductId: number;
  adductLabel: string;
  ionMode: IonMode;
  theoreticalMz: number;
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

type AdductMzResponse = {
  rows: AdductMzRow[];
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

type MassResultState = {
  queryMz: number;
  page: number;
  pageInput: string;
  rows: AdductMzRow[];
  pagination: PaginationMeta | null;
  isLoading: boolean;
  errorMessage: string | null;
};

const LIMIT_OPTIONS = [10, 25, 50, 100] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

const MAX_MASS_SECTIONS = 10;

type AdductMzSortBy =
  | "accession"
  | "name"
  | "chemicalFormula"
  | "monoisotopicMolecularWeight"
  | "adductLabel"
  | "theoreticalMz"
  | "massErrorPpm";

const ADDUCT_MZ_SORT_OPTIONS = [
  "accession",
  "name",
  "chemicalFormula",
  "monoisotopicMolecularWeight",
  "adductLabel",
  "theoreticalMz",
  "massErrorPpm",
] as const satisfies readonly AdductMzSortBy[];

type SortDirection = "asc" | "desc";

type SortState = {
  sortBy: AdductMzSortBy | null;
  sortDirection: SortDirection;
};

function isLimitOption(value: number): value is LimitOption {
  return LIMIT_OPTIONS.includes(value as LimitOption);
}

function parseLimit(value: string | null): LimitOption {
  const parsed = Number(value);
  return isLimitOption(parsed) ? parsed : 10;
}

function parseIonMode(value: string | null): IonMode {
  return value === "negative" ? "negative" : "positive";
}

function parseToleranceUnit(value: string | null): ToleranceUnit {
  return value === "da" ? "da" : "ppm";
}

function parseSourceTermId(value: string | null) {
  if (!value || value === "any") return "any";
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : "any";
}

function parseSortBy(value: string | null): AdductMzSortBy | null {
  if (ADDUCT_MZ_SORT_OPTIONS.includes(value as AdductMzSortBy)) {
    return value as AdductMzSortBy;
  }

  return null;
}

function parseSortDirection(value: string | null): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

function parseSelectedAdductIds(searchParams: URLSearchParams) {
  const rawAdductIds = searchParams.get("adductIds");

  if (rawAdductIds) {
    return rawAdductIds
      .split(",")
      .map((value) => value.trim())
      .filter((value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0;
      });
  }

  const rawAdductId = searchParams.get("adductId");
  if (!rawAdductId || rawAdductId === "unknown") return [];

  const parsed = Number(rawAdductId);
  return Number.isInteger(parsed) && parsed > 0 ? [String(parsed)] : [];
}

function parseQueryMzValues(value: string) {
  const seen = new Set<string>();
  const allValues: number[] = [];

  value.split(/\r?\n/).forEach((line) => {
    const firstToken = line.split(/[\s,;]+/).find((token) => token.trim().length > 0);
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

function getMassKey(queryMz: number) {
  return String(queryMz);
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value)) return 1;
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(value)), totalPages);
}

function getSortIndicator(sort: SortState, sortBy: AdductMzSortBy) {
  if (sort.sortBy !== sortBy) return "↕";
  return sort.sortDirection === "asc" ? "↑" : "↓";
}

function getAdductSummary(selectedAdductIds: string[]) {
  if (selectedAdductIds.length === 0) return "Unknown / all enabled adducts";
  if (selectedAdductIds.length === 1) return "1 selected";
  return `${selectedAdductIds.length} selected`;
}

function getSelectedAdductLabelSummary(adductOptions: AdductOption[], selectedAdductIds: string[]) {
  if (selectedAdductIds.length === 0) {
    return "Selected: Unknown / all enabled adducts";
  }

  const selectedLabels = selectedAdductIds
    .map((id) => adductOptions.find((adduct) => String(adduct.id) === id)?.label)
    .filter((label): label is string => Boolean(label));

  if (selectedLabels.length === 0) {
    return `${selectedAdductIds.length} selected`;
  }

  const visibleLabels = selectedLabels.slice(0, 3);
  const hiddenCount = selectedLabels.length - visibleLabels.length;

  return hiddenCount > 0
    ? `Selected: ${visibleLabels.join(", ")} +${hiddenCount} more`
    : `Selected: ${visibleLabels.join(", ")}`;
}

function buildEmptyMassResult(queryMz: number): MassResultState {
  return {
    queryMz,
    page: 1,
    pageInput: "1",
    rows: [],
    pagination: null,
    isLoading: true,
    errorMessage: null,
  };
}

export function AdductMzSearchClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [queryMzValuesDraft, setQueryMzValuesDraft] = useState("");
  const [queryMzValues, setQueryMzValues] = useState("");

  const [ionModeDraft, setIonModeDraft] = useState<IonMode>("positive");
  const [ionMode, setIonMode] = useState<IonMode>("positive");

  const [selectedAdductIdsDraft, setSelectedAdductIdsDraft] = useState<string[]>([]);
  const [selectedAdductIds, setSelectedAdductIds] = useState<string[]>([]);

  const [toleranceDraft, setToleranceDraft] = useState("10");
  const [tolerance, setTolerance] = useState("10");

  const [toleranceUnitDraft, setToleranceUnitDraft] = useState<ToleranceUnit>("ppm");
  const [toleranceUnit, setToleranceUnit] = useState<ToleranceUnit>("ppm");

  const [sourceTermIdDraft, setSourceTermIdDraft] = useState("any");
  const [sourceTermId, setSourceTermId] = useState("any");

  const [limitDraft, setLimitDraft] = useState<LimitOption>(10);
  const [limit, setLimit] = useState<LimitOption>(10);

  const [sort, setSort] = useState<SortState>({
    sortBy: null,
    sortDirection: "asc",
  });

  const [adductOptions, setAdductOptions] = useState<AdductOption[]>([]);
  const [sourceTerms, setSourceTerms] = useState<SourceTermOption[]>([]);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [massResults, setMassResults] = useState<Record<string, MassResultState>>({});

  useEffect(() => {
    const nextQueryMzValues = searchParams.get("queryMzValues") ?? "";
    const nextIonMode = parseIonMode(searchParams.get("ionMode"));
    const nextSelectedAdductIds = parseSelectedAdductIds(searchParams);
    const nextTolerance = searchParams.get("tolerance") ?? "10";
    const nextToleranceUnit = parseToleranceUnit(searchParams.get("toleranceUnit"));
    const nextSourceTermId = parseSourceTermId(searchParams.get("sourceTermId"));
    const nextLimit = parseLimit(searchParams.get("limit"));
    const nextSortBy = parseSortBy(searchParams.get("sortBy"));
    const nextSortDirection = parseSortDirection(searchParams.get("sortDirection"));

    setQueryMzValuesDraft(nextQueryMzValues);
    setQueryMzValues(nextQueryMzValues);

    setIonModeDraft(nextIonMode);
    setIonMode(nextIonMode);

    setSelectedAdductIdsDraft(nextSelectedAdductIds);
    setSelectedAdductIds(nextSelectedAdductIds);

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

  const allParsedMzValues = useMemo(() => parseQueryMzValues(queryMzValues), [queryMzValues]);
  const parsedMzValues = useMemo(() => allParsedMzValues.slice(0, MAX_MASS_SECTIONS), [allParsedMzValues]);
  const skippedMzCount = Math.max(0, allParsedMzValues.length - parsedMzValues.length);
  const hasSubmittedQuery = parsedMzValues.length > 0;
  const selectedAdductIdsKey = selectedAdductIds.join(",");

  const buildApiUrl = useCallback(
    (queryMz: number, page: number) => {
      const apiParams = new URLSearchParams({
        queryMz: String(queryMz),
        ionMode,
        page: String(page),
        limit: String(limit),
      });

      const trimmedTolerance = tolerance.trim();
      if (trimmedTolerance) {
        apiParams.set("tolerance", trimmedTolerance);
        apiParams.set("toleranceUnit", toleranceUnit);
      }

      selectedAdductIds.forEach((id) => {
        apiParams.append("adductIds", id);
      });

      if (sourceTermId !== "any") apiParams.set("sourceTermId", sourceTermId);
      if (sort.sortBy) {
        apiParams.set("sortBy", sort.sortBy);
        apiParams.set("sortDirection", sort.sortDirection);
      }

      return `/api/search/adduct-mz?${apiParams.toString()}`;
    },
    [ionMode, limit, selectedAdductIds, sourceTermId, sort.sortBy, sort.sortDirection, tolerance, toleranceUnit]
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function loadMetadata() {
      setMetadataError(null);

      try {
        const [adducts, sources] = await Promise.all([
          fetchJson<AdductOption[]>(`/api/metadata/adducts?ionMode=${ionModeDraft}`, abortController.signal),
          fetchJson<SourceTermOption[]>("/api/metadata/source-terms", abortController.signal),
        ]);

        setAdductOptions(adducts);
        setSourceTerms(sources);

        const validIds = new Set(adducts.map((adduct) => String(adduct.id)));
        setSelectedAdductIdsDraft((current) => current.filter((id) => validIds.has(id)));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMetadataError(error instanceof Error ? error.message : "Failed to load metadata");
      }
    }

    loadMetadata();

    return () => {
      abortController.abort();
    };
  }, [ionModeDraft]);

  useEffect(() => {
    if (!hasSubmittedQuery) {
      setMassResults({});
      return;
    }

    const abortController = new AbortController();
    const nextInitialResults = Object.fromEntries(
      parsedMzValues.map((queryMz) => [getMassKey(queryMz), buildEmptyMassResult(queryMz)])
    );

    setMassResults(nextInitialResults);

    parsedMzValues.forEach(async (queryMz) => {
      const key = getMassKey(queryMz);

      try {
        const data = await fetchJson<AdductMzResponse>(buildApiUrl(queryMz, 1), abortController.signal);

        setMassResults((current) => ({
          ...current,
          [key]: {
            queryMz,
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
            queryMz,
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
  }, [buildApiUrl, hasSubmittedQuery, parsedMzValues, selectedAdductIdsKey]);

  function buildSearchUrl(input: {
    queryMzValues: string;
    ionMode: IonMode;
    selectedAdductIds: string[];
    tolerance: string;
    toleranceUnit: ToleranceUnit;
    sourceTermId: string;
    limit: LimitOption;
    sortBy: AdductMzSortBy | null;
    sortDirection: SortDirection;
  }) {
    const params = new URLSearchParams();
    const trimmedQueryMzValues = input.queryMzValues.trim();
    const trimmedTolerance = input.tolerance.trim();

    if (trimmedQueryMzValues) params.set("queryMzValues", trimmedQueryMzValues);
    params.set("ionMode", input.ionMode);

    if (input.selectedAdductIds.length > 0) {
      params.set("adductIds", input.selectedAdductIds.join(","));
    }

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
    queryMzValues: string;
    ionMode: IonMode;
    selectedAdductIds: string[];
    tolerance: string;
    toleranceUnit: ToleranceUnit;
    sourceTermId: string;
    limit: LimitOption;
    sortBy: AdductMzSortBy | null;
    sortDirection: SortDirection;
  }) {
    router.push(buildSearchUrl(input), { scroll: false });
  }

  function replaceSearchState(input: {
    queryMzValues: string;
    ionMode: IonMode;
    selectedAdductIds: string[];
    tolerance: string;
    toleranceUnit: ToleranceUnit;
    sourceTermId: string;
    limit: LimitOption;
    sortBy: AdductMzSortBy | null;
    sortDirection: SortDirection;
  }) {
    router.replace(buildSearchUrl(input), { scroll: false });
  }

  function handleSearchSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQueryMzValues = queryMzValuesDraft.trim();
    if (!trimmedQueryMzValues) {
      router.push(pathname, { scroll: false });
      return;
    }

    pushSearchState({
      queryMzValues: trimmedQueryMzValues,
      ionMode: ionModeDraft,
      selectedAdductIds: selectedAdductIdsDraft,
      tolerance: toleranceDraft,
      toleranceUnit: toleranceUnitDraft,
      sourceTermId: sourceTermIdDraft,
      limit: limitDraft,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    });
  }

  function resetSearch() {
    setQueryMzValuesDraft("");
    router.push(pathname, { scroll: false });
  }

  function loadExample() {
    const exampleMz = "74.0785 122.21\n104.1045 126.73\n228.202 150.79";
    setQueryMzValuesDraft(exampleMz);
    setIonModeDraft("positive");
    setSelectedAdductIdsDraft([]);
    setToleranceDraft("0.05");
    setToleranceUnitDraft("da");
    setSourceTermIdDraft("any");
    setLimitDraft(10);
    pushSearchState({
      queryMzValues: exampleMz,
      ionMode: "positive",
      selectedAdductIds: [],
      tolerance: "0.05",
      toleranceUnit: "da",
      sourceTermId: "any",
      limit: 10,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    });
  }

  async function goToMassPage(queryMz: number, nextPage: number) {
    const key = getMassKey(queryMz);
    const currentResult = massResults[key];
    const safePage = clampPage(nextPage, currentResult?.pagination?.totalPages ?? 1);

    setMassResults((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? buildEmptyMassResult(queryMz)),
        page: safePage,
        pageInput: String(safePage),
        isLoading: true,
        errorMessage: null,
      },
    }));

    try {
      const data = await fetchJson<AdductMzResponse>(buildApiUrl(queryMz, safePage));

      setMassResults((current) => ({
        ...current,
        [key]: {
          queryMz,
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
          ...(current[key] ?? buildEmptyMassResult(queryMz)),
          isLoading: false,
          errorMessage: error instanceof Error ? error.message : "Search failed",
        },
      }));
    }
  }

  function handleMassPageInputChange(queryMz: number, value: string) {
    const key = getMassKey(queryMz);

    setMassResults((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? buildEmptyMassResult(queryMz)),
        pageInput: value,
      },
    }));
  }

  function handleMassPageJump(event: SyntheticEvent<HTMLFormElement>, queryMz: number) {
    event.preventDefault();
    const key = getMassKey(queryMz);
    const requestedPage = Number(massResults[key]?.pageInput ?? "1");
    goToMassPage(queryMz, requestedPage);
  }

  function handleSort(nextSortBy: AdductMzSortBy) {
    const nextSort: SortState =
      sort.sortBy !== nextSortBy
        ? { sortBy: nextSortBy, sortDirection: "asc" }
        : {
            sortBy: nextSortBy,
            sortDirection: sort.sortDirection === "asc" ? "desc" : "asc",
          };

    replaceSearchState({
      queryMzValues,
      ionMode,
      selectedAdductIds,
      tolerance,
      toleranceUnit,
      sourceTermId,
      limit,
      sortBy: nextSort.sortBy,
      sortDirection: nextSort.sortDirection,
    });
  }

  function resetSort() {
    replaceSearchState({
      queryMzValues,
      ionMode,
      selectedAdductIds,
      tolerance,
      toleranceUnit,
      sourceTermId,
      limit,
      sortBy: null,
      sortDirection: "asc",
    });
  }

  function handleIonModeDraftChange(nextIonMode: IonMode) {
    setIonModeDraft(nextIonMode);
    setSelectedAdductIdsDraft([]);
  }

  function selectUnknownAdduct() {
    setSelectedAdductIdsDraft([]);
  }

  function toggleKnownAdduct(id: string) {
    setSelectedAdductIdsDraft((current) => {
      if (current.includes(id)) return current.filter((currentId) => currentId !== id);
      return [...current, id];
    });
  }

  function SortButton(props: { sortBy: AdductMzSortBy; children: ReactNode }) {
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
    const canNavigateSection = !!result.pagination && result.pagination.totalPages > 0 && !result.isLoading;

    const summary = result.pagination
      ? `${result.pagination.totalRows === 0 ? "No results" : `${(result.pagination.page - 1) * result.pagination.pageSize + 1}-${Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.totalRows)} of ${result.pagination.totalRows}`}`
      : null;

    return (
      <SectionPanel>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Results for <span className="font-mono">{result.queryMz}</span>
            </h2>
            <p className="text-sm text-slate-600">
              {summary ? `${summary} · Delta shown as absolute rounded ppm` : "Loading section summary..."}
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
          <Table className="min-w-262.5 table-fixed">
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
                  <SortButton sortBy="monoisotopicMolecularWeight">Monoisotopic Mass</SortButton>
                </TableHead>
                <TableHead className="w-34">
                  <SortButton sortBy="adductLabel">Adduct</SortButton>
                </TableHead>
                <TableHead className="w-37.5">
                  <SortButton sortBy="theoreticalMz">Adduct M/Z</SortButton>
                </TableHead>
                <TableHead className="w-32">
                  <SortButton sortBy="massErrorPpm">Delta (ppm)</SortButton>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.isLoading && result.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                    Loading results...
                  </TableCell>
                </TableRow>
              ) : result.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                    No adduct matches found.
                  </TableCell>
                </TableRow>
              ) : (
                result.rows.map((row) => (
                  <TableRow key={`${result.queryMz}-${row.compoundId}-${row.adductId}-${row.theoreticalMz}`}>
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
                    <TableCell className="w-34 truncate" title={row.adductLabel}>
                      {row.adductLabel}
                    </TableCell>
                    <TableCell className="w-37.5 font-mono text-xs tabular-nums">
                      {row.theoreticalMz.toString()}
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
          onPageInputChange={(value) => handleMassPageInputChange(result.queryMz, value)}
          onPageJump={() => {
            const requestedPage = Number(result.pageInput);
            goToMassPage(result.queryMz, requestedPage);
          }}
          onPageChange={(nextPage) => goToMassPage(result.queryMz, nextPage)}
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Search Options</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">LC-MS / Adduct m/z Search</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Search by observed m/z using ion mode, one or more adduct types, tolerance, and source filtering.
                Multiple m/z values create stacked result sections with independent pagination.
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
              <label className="text-sm font-semibold text-slate-950" htmlFor="query-mz-values">
                Query m/z values
              </label>
              <textarea
                id="query-mz-values"
                value={queryMzValuesDraft}
                onChange={(event) => setQueryMzValuesDraft(event.target.value)}
                className="min-h-72 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder={"74.0785 122.21\n104.1045 126.73\n228.202 150.79"}
              />
              <p className="text-xs text-slate-500">
                Enter one m/z per line. The first numeric value on each line is used. Up to {MAX_MASS_SECTIONS} m/z
                sections are searched.
              </p>
              {hasSubmittedQuery ? (
                <p className="text-xs text-cyan-800">
                  Showing {parsedMzValues.length} m/z section{parsedMzValues.length === 1 ? "" : "s"}.
                  {skippedMzCount > 0
                    ? ` ${skippedMzCount} extra value${skippedMzCount === 1 ? "" : "s"} skipped for now.`
                    : null}
                </p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-950">Ion Mode</label>
                <Select value={ionModeDraft} onValueChange={(value) => handleIonModeDraftChange(value as IonMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-950">Adduct Type</label>
                  <span className="text-xs text-slate-500">{getAdductSummary(selectedAdductIdsDraft)}</span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-cyan-900/10 bg-cyan-950/2.5 px-3 py-2">
                  <span className="text-xs text-slate-600">
                    {selectedAdductIdsDraft.length === 0
                      ? "Unknown searches all enabled adducts."
                      : "Selected adducts restrict the search."}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={selectedAdductIdsDraft.length === 0}
                    onClick={selectUnknownAdduct}
                  >
                    Clear selected
                  </Button>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border border-input bg-background p-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-cyan-950/5">
                    <input
                      type="checkbox"
                      checked={selectedAdductIdsDraft.length === 0}
                      onChange={selectUnknownAdduct}
                      className="h-4 w-4 rounded border-slate-300 accent-cyan-700"
                    />
                    <span className="font-medium text-slate-900">Unknown</span>
                    <span className="text-xs text-slate-500">all enabled adducts</span>
                  </label>

                  <div className="my-2 border-t border-cyan-900/10" />

                  {adductOptions.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-slate-500">No adducts available.</div>
                  ) : (
                    adductOptions.map((adduct) => {
                      const id = String(adduct.id);
                      return (
                        <label
                          key={adduct.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-cyan-950/5"
                        >
                          <input
                            type="checkbox"
                            checked={selectedAdductIdsDraft.includes(id)}
                            onChange={() => toggleKnownAdduct(id)}
                            className="h-4 w-4 rounded border-slate-300 accent-cyan-700"
                          />
                          <span className="font-mono text-xs text-slate-900">{adduct.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                <p className="rounded-md bg-cyan-950/2.5 px-3 py-2 text-xs text-slate-600">
                  {getSelectedAdductLabelSummary(adductOptions, selectedAdductIdsDraft)}
                </p>

                <p className="text-xs text-slate-500">
                  Select Unknown to clear previous choices. Select one or more known adducts to restrict the search.
                </p>
              </div>

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
                <div className="flex gap-2">
                  <Button type="submit" disabled={queryMzValuesDraft.trim().length === 0}>
                    Search
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
          <SectionPanel className="text-sm text-slate-600">Enter m/z search options and click Search.</SectionPanel>
        ) : null}

        {hasSubmittedQuery ? (
          <SectionPanel className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                Showing {parsedMzValues.length} m/z section{parsedMzValues.length === 1 ? "" : "s"}
                {sort.sortBy ? (
                  <span>
                    {" "}
                    · Sorted by {sort.sortBy} {sort.sortDirection}
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

        {parsedMzValues.map((queryMz) => {
          const key = getMassKey(queryMz);
          return <div key={key}>{renderResultTable(massResults[key] ?? buildEmptyMassResult(queryMz))}</div>;
        })}
      </div>
    </main>
  );
}
