export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const ALLOWED_LIMITS = [10, 25, 50, 100] as const;

export type AllowedLimit = (typeof ALLOWED_LIMITS)[number];

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type OffsetPagination = {
  page: number;
  limit: AllowedLimit;
  offset: number;
};

export function normalizeLimit(value: number): AllowedLimit {
  if ((ALLOWED_LIMITS as readonly number[]).includes(value)) {
    return value as AllowedLimit;
  }

  return DEFAULT_LIMIT;
}

export function getOffsetPagination(input: { page: number; limit: number }): OffsetPagination {
  const page = Math.max(DEFAULT_PAGE, Math.trunc(input.page));
  const limit = normalizeLimit(input.limit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function buildPaginationMeta(input: {
  page: number;
  limit: number;
  totalRows: number;
}): PaginationMeta {
  const totalPages = input.totalRows === 0 ? 0 : Math.ceil(input.totalRows / input.limit);

  return {
    page: input.page,
    pageSize: input.limit,
    totalRows: input.totalRows,
    totalPages,
    hasNextPage: totalPages > 0 && input.page < totalPages,
    hasPreviousPage: input.page > 1 && totalPages > 0,
  };
}
