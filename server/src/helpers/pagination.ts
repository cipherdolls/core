export function parsePagination(page?: string, limit?: string) {
  const pageNum = Math.max(1, parseInt(page ?? '1'));
  const take = Math.min(Math.max(1, parseInt(limit ?? '10')), 100);
  const skip = (pageNum - 1) * take;
  return { pageNum, take, skip };
}

export function paginationMeta(total: number, pageNum: number, take: number) {
  return { total, page: pageNum, limit: take, totalPages: Math.ceil(total / take) };
}

export function formatDecimal(val: any): number {
  return val != null ? Number(val) : 0;
}
