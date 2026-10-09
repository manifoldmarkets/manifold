import { sortBy, uniqBy } from 'lodash'

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract, isMultiCpmm } from 'common/contract'

// Pure selection rules for the elections page's data-driven sections: the
// Manifold Midterm Contest spotlight, the conditional-markets row, and the
// Trending carousel. Kept free of I/O so they can be unit tested
// (election-curation.test.ts) and re-run on every ISR revalidation.

// The Manifold Midterm Contest topic (manifold.markets/topic/26-midterm-contest),
// run by Jack1.
export const MIDTERM_CONTEST_TOPIC_SLUG = '26-midterm-contest'

/** Open, public, not deleted, not resolved, and still tradable at `now`. */
export function isOpenPublicMarket(contract: Contract, now: number): boolean {
  return (
    contract.visibility === 'public' &&
    contract.deleted !== true &&
    !contract.isResolved &&
    !contract.resolution &&
    (contract.closeTime == null || contract.closeTime > now)
  )
}

const num = (x: number | undefined | null) =>
  x != null && Number.isFinite(x) ? x : 0

/**
 * The contest markets most worth a spotlight slot: most unique traders first,
 * then the most recent volume, then lifetime volume. Resolved, closed, private
 * and deleted markets drop out by themselves.
 */
export function rankContestMarkets(
  contracts: Contract[],
  options: { now: number; limit: number }
): Contract[] {
  const { now, limit } = options
  const open = uniqBy(contracts, (c) => c.id).filter((c) =>
    isOpenPublicMarket(c, now)
  )
  return sortBy(open, [
    (c) => -num(c.uniqueBettorCount),
    (c) => -num(c.volume24Hours),
    (c) => -num(c.volume),
  ]).slice(0, limit)
}

// --- Trending -------------------------------------------------------------

// A trending market needs this many unique traders. Below it, the carousel
// filled with one-trader seed markets and side bets (the launch review found
// six of ten cards from one creator, several with three traders).
export const TRENDING_MIN_TRADERS = 10
// No creator gets more than this many of the ten slots.
export const TRENDING_MAX_PER_CREATOR = 2
export const TRENDING_SIZE = 10

// The question names a federal or gubernatorial race, or the election itself.
const RACE_TERMS =
  /\b(senate|senators?|house|congress|congressional|congressman|congresswoman|governors?|gubernatorial|elections?|seats?|districts?|turnout|candidates?|nominees?)\b/i
// ...but not a state-legislative or local race, or a ballot measure.
const NOT_FEDERAL_OR_GOVERNOR =
  /\bstate (senate|house|assembly|legislature)\b|\b(state legislative|legislative district|assembly district|mayor(al)?|city council|school board|county commission(er)?)\b|\b(proposition|prop\.?|amendment|question|measure|initiative) \d+\b/i

export function isFederalOrGubernatorialElectionMarket(
  contract: Pick<Contract, 'question'>
): boolean {
  const q = contract.question ?? ''
  return RACE_TERMS.test(q) && !NOT_FEDERAL_OR_GOVERNOR.test(q)
}

/**
 * Trending for launch: candidates in priority order (hot today first, then
 * backfill), kept only if open and public, about a federal or gubernatorial
 * race, traded by at least TRENDING_MIN_TRADERS people, and not already shown
 * elsewhere on the page. Then at most TRENDING_MAX_PER_CREATOR per creator.
 */
export function curateTrendingMarkets(
  candidates: Contract[],
  options: {
    now: number
    excludeIds?: string[]
    excludeSlugs?: string[]
    minTraders?: number
    maxPerCreator?: number
    limit?: number
  }
): Contract[] {
  const {
    now,
    excludeIds = [],
    excludeSlugs = [],
    minTraders = TRENDING_MIN_TRADERS,
    maxPerCreator = TRENDING_MAX_PER_CREATOR,
    limit = TRENDING_SIZE,
  } = options

  const eligible = uniqBy(candidates, (c) => c.id).filter(
    (c) =>
      !excludeIds.includes(c.id) &&
      !excludeSlugs.includes(c.slug) &&
      isOpenPublicMarket(c, now) &&
      num(c.uniqueBettorCount) >= minTraders &&
      isFederalOrGubernatorialElectionMarket(c)
  )

  const perCreator: Record<string, number> = {}
  const picked: Contract[] = []
  for (const c of eligible) {
    if (picked.length >= limit) break
    const count = perCreator[c.creatorId] ?? 0
    if (count >= maxPerCreator) continue
    perCreator[c.creatorId] = count + 1
    picked.push(c)
  }
  return picked
}

// --- Leading answer --------------------------------------------------------

/**
 * What a compact card shows as the market's headline number: the YES chance
 * for a binary market, or the leading answer and its chance for a
 * multiple-choice one. Undefined when there is nothing honest to show (e.g. a
 * multi with no priced answers), so the card can omit the number rather than
 * draw a bar without a percent.
 */
export type HeadlineOdds =
  | { kind: 'binary'; prob: number }
  | { kind: 'multi'; answer: string; prob: number }

export function getHeadlineOdds(contract: Contract): HeadlineOdds | undefined {
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
    const prob = getDisplayProbability(contract as BinaryContract)
    return Number.isFinite(prob) ? { kind: 'binary', prob } : undefined
  }
  if (isMultiCpmm(contract)) {
    const answers = contract.answers
      .filter((a) => !a.resolution)
      .map((a) => ({
        text: a.isOther ? 'Other' : a.text,
        prob: getAnswerProbability(contract, a.id),
      }))
      .filter((a) => Number.isFinite(a.prob))
    const leader = sortBy(answers, (a) => -a.prob)[0]
    return leader
      ? { kind: 'multi', answer: leader.text, prob: leader.prob }
      : undefined
  }
  return undefined
}

// --- Balance of Power colors -------------------------------------------------

// Bar colors for the "Who controls Congress" market, by what each answer
// means rather than the default answer palette (which painted "Democrats
// Sweep" light blue, a split green and "Republicans Sweep" yellow). The party
// tints match the explorer's party panels (azure-300 / sienna-300); the two
// split outcomes get two distinguishable purples.
export const BOP_COLORS = {
  demSweep: '#adc4e3',
  repSweep: '#ecbab5',
  demSenateRepHouse: '#c9b3e6',
  repSenateDemHouse: '#a98fd6',
  other: '#d1d5db',
}

/** Maps a Balance of Power answer label to its display color. */
export function balanceOfPowerAnswerColor(text: string): string {
  const t = text.toLowerCase()
  const isDem = (s: string) => /\b(d|dem|dems|democrats?|democratic)\b/.test(s)
  const isRep = (s: string) =>
    /\b(r|rep|reps|gop|republicans?|republican)\b/.test(s)

  if (/sweep|trifecta|both chambers|control (of )?both/.test(t)) {
    if (isDem(t) && !isRep(t)) return BOP_COLORS.demSweep
    if (isRep(t) && !isDem(t)) return BOP_COLORS.repSweep
  }
  // Splits: "D Senate, R House" / "R Senate, D House" (either order of
  // chambers). Find which party is attached to the Senate.
  const senate = t.match(/\b(\w+)\s+senate\b|\bsenate\s*[:-]?\s*(\w+)\b/)
  const house = t.match(/\b(\w+)\s+house\b|\bhouse\s*[:-]?\s*(\w+)\b/)
  if (senate && house) {
    const senateParty = senate[1] ?? senate[2] ?? ''
    const houseParty = house[1] ?? house[2] ?? ''
    if (isDem(senateParty) && isRep(houseParty))
      return BOP_COLORS.demSenateRepHouse
    if (isRep(senateParty) && isDem(houseParty))
      return BOP_COLORS.repSenateDemHouse
    if (isDem(senateParty) && isDem(houseParty)) return BOP_COLORS.demSweep
    if (isRep(senateParty) && isRep(houseParty)) return BOP_COLORS.repSweep
  }
  return BOP_COLORS.other
}
