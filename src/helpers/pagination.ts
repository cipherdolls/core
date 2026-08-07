/** parseInt on junk yields NaN, and NaN survives Math.min/max — it would reach
 *  Prisma as `take: NaN` and blow up the query. Fall back to the default. */
function parseIntOr(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parsePagination(page?: string, limit?: string) {
  const pageNum = Math.max(1, parseIntOr(page, 1));
  const take = Math.min(Math.max(1, parseIntOr(limit, 10)), 100);
  const skip = (pageNum - 1) * take;
  return { pageNum, take, skip };
}

export function paginationMeta(total: number, pageNum: number, take: number) {
  return { total, page: pageNum, limit: take, totalPages: Math.ceil(total / take) };
}

export function formatDecimal(val: any): number {
  return val != null ? Number(val) : 0;
}
