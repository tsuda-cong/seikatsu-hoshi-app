/**
 * Supabaseは1回のクエリで最大1000行しか返さない。取得件数が上限に達したら、
 * 続きが無くなるまで range() をずらして取り直す。
 *
 * 上限に当たっても**エラーにはならず、黙って1000行で切られる**のがたちの悪いところで、
 * 実際に週の一覧が途中までしか出ず、ナビゲーションから最近の週が消える不具合が起きた
 * (2026-08-28、過去データの取り込みで行数が1000を超えたとき)。
 * 行数が増えうるテーブル(programs / assignments)を読むときは必ずこれを通すこと。
 */

const PAGE_SIZE = 1000

interface RangeQuery<T> {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

export async function fetchAllRows<T>(build: () => RangeQuery<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}
