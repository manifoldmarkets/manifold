export type VersusPositionRow = {
  user_id: string
  answer_id: string | null
  total_shares_yes: number | null
  total_shares_no: number | null
}

/** Rank complete versus positions before paging users or fetching full metrics. */
export const rankVersusPositionUsers = (
  rows: VersusPositionRow[],
  mainAnswerId: string,
  otherAnswerId: string
): { yes: string[]; no: string[] } => {
  const seen = new Set<string>()
  const positions = new Map<
    string,
    { userId: string; yes: number; no: number }
  >()
  for (const row of rows) {
    if (row.answer_id !== mainAnswerId && row.answer_id !== otherAnswerId)
      continue
    const key = row.user_id + '|' + row.answer_id
    if (seen.has(key)) continue
    seen.add(key)

    const position = positions.get(row.user_id) ?? {
      userId: row.user_id,
      yes: 0,
      no: 0,
    }
    const isMain = row.answer_id === mainAnswerId
    position.yes += (isMain ? row.total_shares_yes : row.total_shares_no) ?? 0
    position.no += (isMain ? row.total_shares_no : row.total_shares_yes) ?? 0
    positions.set(row.user_id, position)
  }

  // Match the holders table: users with both sides appear in its YES column.
  // Apply the threshold after summing, including fractional per-answer shares.
  const yes = [...positions.values()].filter((position) => position.yes >= 1)
  const no = [...positions.values()].filter(
    (position) => position.yes < 1 && position.no >= 1
  )
  const rank = (side: 'yes' | 'no', users: typeof yes) =>
    users
      .sort(
        (a, b) =>
          b[side] - a[side] ||
          (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
      )
      .map((position) => position.userId)
  return { yes: rank('yes', yes), no: rank('no', no) }
}
