// PostgREST caps a single response at 1000 rows. Any query whose full result set is
// consumed (aggregated for reports, or listed in full) must page through all rows or it
// silently truncates with no error. Pass a factory that applies .range(from, to) to a
// freshly-built query; include a stable .order(...) so paging can't skip/duplicate rows.
const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllRows(
  buildQuery: (
    fromRow: number,
    toRow: number,
  ) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<any[]> {
  const all: any[] = [];
  for (let fromRow = 0; ; fromRow += pageSize) {
    const { data, error } = await buildQuery(fromRow, fromRow + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}
