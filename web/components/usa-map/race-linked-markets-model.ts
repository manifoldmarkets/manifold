import { sortBy } from 'lodash'
import { Contract } from 'common/contract'
import { MarketLinkRef, MarketLinkRelation } from 'common/market-links'
import type { Race } from './election-map-model'

// The markets linked to a race (common/market-links) hang off the race's own
// market. A district priced by one answer of a shared portfolio has no market
// of its own, so a link to the portfolio would not name a district; such a
// race has no parent here, and so no linked markets.
export function linkedRaceParent(
  race: Pick<Race, 'contract' | 'answerId'>
): Contract | undefined {
  return race.contract && !race.answerId ? race.contract : undefined
}

// Lines (margins, thresholds) first, then props, then whatever else is related.
const RELATION_ORDER: MarketLinkRelation[] = ['line', 'prop', 'related']

// The children worth listing: open markets only, each once, never the parent
// itself, grouped by relation and otherwise in the API's order (newest first).
export function openLinkedChildren(
  children: readonly MarketLinkRef[],
  parentId: string
): MarketLinkRef[] {
  const seen = new Set([parentId])
  const open: MarketLinkRef[] = []
  for (const ref of children) {
    if (seen.has(ref.id) || ref.isResolved) continue
    seen.add(ref.id)
    open.push(ref)
  }
  return sortBy(open, (ref) => RELATION_ORDER.indexOf(ref.relation))
}

// /create reads its prefill from a JSON `params` query value. `rand` makes it
// replace a draft the form saved earlier and applies the topic slugs. The new
// market is linked to the race's market, so it lists under the race. Its
// deadline defaults to that market's current deadline; the creator can
// override it, and later changes to the race's market do not move it.
export function createLinkedMarketHref(
  race: Pick<Race, 'label'>,
  parent: Contract
) {
  const params = {
    q: `${race.label} 2026: `,
    description: '',
    closeTime: parent.closeTime,
    visibility: 'public',
    groupSlugs: ['2026-midterms'],
    rand: parent.id.slice(0, 6),
    linkedToContractId: parent.id,
    linkRelation: 'prop',
  }
  return `/create?params=${encodeURIComponent(JSON.stringify(params))}`
}
