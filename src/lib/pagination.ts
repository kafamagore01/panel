export const PAGE_SIZE = 15;
export const FORM_OPTION_LIMIT = 500;
const MAX_PAGE = 100_000;
const MAX_SEARCH_LENGTH = 200;

export type SearchParams = { [key: string]: string | string[] | undefined };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export type ParsedListParams = {
  page: number;
  skip: number;
  take: number;
  search: string;
  status: string | undefined;
};

/** Liste sayfaları için ?sayfa=&arama=&durum= searchParams'ını ayrıştırır. */
export function parseListParams(
  params: SearchParams,
  pageSize = PAGE_SIZE
): ParsedListParams {
  const rawPage = Number.parseInt(first(params.sayfa) ?? "1", 10);
  const page =
    Number.isFinite(rawPage) && rawPage > 0
      ? Math.min(rawPage, MAX_PAGE)
      : 1;
  const search = (first(params.arama) ?? "")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
  const status = first(params.durum)?.trim() || undefined;
  return {
    page,
    skip: (page - 1) * pageSize,
    take: pageSize,
    search,
    status,
  };
}

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
