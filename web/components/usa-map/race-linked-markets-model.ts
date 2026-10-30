import { sortBy } from 'lodash'
import { Contract } from 'common/contract'
import { MarketLinkRef, MarketLinkRelation } from 'common/market-links'
import type { Race } from './election-map-model'

// The markets linked to a race (common/market-links) hang off the race's own
// market and off its candidate market: a prop on the Texas Senate race may be
// linked to either. A district priced by one answer of a shared portfolio has
// no market of its own, so a link to the portfolio would not name a district;
// those races get no parent here, and so no linked markets.
export function linkedRaceParents(
  race: Pick<Race, 'contract' | 'answerId'>,
  candidate?: Contract | null
): Contract[] {
  const parents: Contract[] = []
  if (race.contract && !race.answerId) parents.push(race.contract)
  if (candidate && !parents.some((p) => p.id === candidate.id))
    parents.push(candidate)
  return parents
}

// Lines (margins, thresholds) first, then props, then whatever else is related.
const RELATION_ORDER: MarketLinkRelation[] = ['line', 'prop', 'related']

// Every parent's children as one list: open markets only, each once, grouped
// by relation and otherwise in the API's order (newest first). A parent is
// never listed under itself or under the other parent, so the candidate
// market linked to the party market stays in its own section.
export function mergeLinkedChildren(
  lists: (readonly MarketLinkRef[] | undefined)[],
  parentIds: string[]
): MarketLinkRef[] {
  const seen = new Set(parentIds)
  const merged: MarketLinkRef[] = []
  for (const list of lists) {
    for (const ref of list ?? []) {
      if (seen.has(ref.id) || ref.isResolved) continue
      seen.add(ref.id)
      merged.push(ref)
    }
  }
  return sortBy(merged, (ref) => RELATION_ORDER.indexOf(ref.relation))
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
