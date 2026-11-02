// How many open markets are linked (common/market-links) to each race market
// on the election map. Read once per page build from the admin client, so a
// hovered race can say "3 linked markets" without a request; the pinned
// card then reads the list itself. The count follows the same rule as the
// card's list: public, not deleted, not resolved.

export type LinkedMarketRow = {
  parent_contract_id: string
  child_contract_id: string
}

export type LinkedChildStatus = {
  id: string
  visibility: string | null
  resolution: string | null
  deleted: boolean | null
}

export function countLinkedMarkets(
  links: readonly LinkedMarketRow[],
  children: readonly LinkedChildStatus[]
): Record<string, number> {
  const open = new Set(
    children
      .filter(
        (c) =>
          (c.visibility ?? 'public') === 'public' &&
          !c.deleted &&
          c.resolution == null
      )
      .map((c) => c.id)
  )
  const counts: Record<string, number> = {}
  for (const link of links) {
    if (!open.has(link.child_contract_id)) continue
    counts[link.parent_contract_id] =
      (counts[link.parent_contract_id] ?? 0) + 1
  }
  return counts
}
