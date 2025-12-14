// apps/api/src/shared/pagination.ts

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Convert page/limit into LIMIT/OFFSET values for SQL.
 */
export function toLimitOffset(params: PaginationParams): {
  limit: number;
  offset: number;
} {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;
  return { limit, offset };
}

/**
 * Wrap items+metadata into the standard response shape.
 */
export function toPaginatedResult<T>(
  items: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  return { items, total, page, limit };
}
