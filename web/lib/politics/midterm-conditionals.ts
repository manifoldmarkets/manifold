import { Contract } from 'common/contract'

import { isOpenPublicMarket } from './election-curation'

// Markets conditional on the 2026 midterm result, shown as the "If Democrats
// win… or Republicans do" row on /election. Hand-curated: no contract field
// marks a market as conditional, and the good ones are few. To feature a new
// market, append it here by slug or by contract id. Entries whose market has
// resolved, closed, gone private or does not exist (yet) are skipped silently,
// so ids can be added before the markets are created.
//
// A `pair` is the same question asked under each outcome ("If Democrats win
// the House…, will X?" / "If Republicans keep the House…, will X?"). It renders
// as one compact card: the shared question once, then both chances side by
// side, Democratic condition on the left. If only one side exists, it shows as
// an ordinary single card.

export type MarketRef = { slug: string } | { id: string }

export type MidtermConditionalEntry =
  | { market: MarketRef }
  | {
      pair: {
        // The chamber the condition is about, for the side labels.
        chamber: 'House' | 'Senate'
        ifDemocrats: MarketRef
        ifRepublicans: MarketRef
      }
    }

export const MIDTERM_CONDITIONALS: MidtermConditionalEntry[] = [
  // "If Dems win the House or Senate in 2026, will officials try to block a
  // working Democratic majority from being seated?" Resolves on the seating of
  // the 120th Congress; N/A unless Democrats win a chamber.
  { market: { slug: 'if-democrats-win-the-house-or-senat' } },
  // "If the Dems win enough seats in the midterms, will Trump be impeached?"
  // N/A unless Democrats win "enough seats", which the creator defines as
  // two-thirds of the House.
  { market: { slug: 'if-the-dems-win-enough-seats-in-the' } },
  // "If Trump puts boots on the ground in Iran, will Dems win the Senate?"
  // Conditional the other way round: the condition is Iran, the outcome is the
  // Senate. N/A unless the linked boots-on-the-ground market resolves YES
  // before the midterms.
  { market: { slug: 'if-trump-puts-boots-on-the-ground-i' } },
  // Paired conditionals created 2026-10-06 (ids reserved before creation).
  // Impeachment: "If Democrats win / Republicans keep the House in 2026, will
  // the House impeach Donald Trump before January 3, 2029?"
  {
    pair: {
      chamber: 'House',
      ifDemocrats: { id: 'QSAIq5EEps' },
      ifRepublicans: { id: 'POZNNqR528' },
    },
  },
  // Government shutdown in 2027.
  {
    pair: {
      chamber: 'House',
      ifDemocrats: { id: '2RZ2c5ZICl' },
      ifRepublicans: { id: '8RI2Qy9ndh' },
    },
  },
  // S&P 500 in 2027.
  {
    pair: {
      chamber: 'House',
      ifDemocrats: { id: 'C9pqA8yg00' },
      ifRepublicans: { id: 'usOOuPqSst' },
    },
  },
  // A Supreme Court seat.
  {
    pair: {
      chamber: 'Senate',
      ifDemocrats: { id: 'pcdS8RNNRA' },
      ifRepublicans: { id: 'RU8Rztcs28' },
    },
  },
]

const refs = (entries: MidtermConditionalEntry[]): MarketRef[] =>
  entries.flatMap((e) =>
    'pair' in e ? [e.pair.ifDemocrats, e.pair.ifRepublicans] : [e.market]
  )

/** Everything the loader has to fetch, split by how it is referenced. */
export function midtermConditionalRefs(
  entries: MidtermConditionalEntry[] = MIDTERM_CONDITIONALS
): { slugs: string[]; ids: string[] } {
  const all = refs(entries)
  return {
    slugs: all.flatMap((r) => ('slug' in r ? [r.slug] : [])),
    ids: all.flatMap((r) => ('id' in r ? [r.id] : [])),
  }
}

// What the page renders: a single market, or a pair shown as one card.
export type MidtermConditionalRow =
  | { kind: 'single'; contract: Contract }
  | {
      kind: 'pair'
      // The shared question, e.g. "Will the House impeach Donald Trump before
      // January 3, 2029?"
      stem: string
      demLabel: string
      repLabel: string
      ifDemocrats: Contract
      ifRepublicans: Contract
    }

/**
 * Resolve the curated entries against fetched contracts, dropping anything
 * missing or not open and public, and degrading a half-missing pair to a
 * single card. `fetched` is everything the loader found, by any reference.
 */
export function buildMidtermConditionalRows(
  fetched: Contract[],
  now: number,
  entries: MidtermConditionalEntry[] = MIDTERM_CONDITIONALS
): MidtermConditionalRow[] {
  const find = (ref: MarketRef) => {
    const c = fetched.find((f) =>
      'id' in ref ? f.id === ref.id : f.slug === ref.slug
    )
    return c && isOpenPublicMarket(c, now) ? c : undefined
  }
  const rows: MidtermConditionalRow[] = []
  const seen: string[] = []
  const push = (row: MidtermConditionalRow) => {
    const ids =
      row.kind === 'pair'
        ? [row.ifDemocrats.id, row.ifRepublicans.id]
        : [row.contract.id]
    if (ids.some((id) => seen.includes(id))) return
    seen.push(...ids)
    rows.push(row)
  }
  for (const entry of entries) {
    if ('pair' in entry) {
      const { chamber } = entry.pair
      const dem = find(entry.pair.ifDemocrats)
      const rep = find(entry.pair.ifRepublicans)
      if (dem && rep)
        push({
          kind: 'pair',
          stem: conditionalStem(dem.question, rep.question),
          demLabel: `If Democrats win the ${chamber}`,
          repLabel: `If Republicans keep the ${chamber}`,
          ifDemocrats: dem,
          ifRepublicans: rep,
        })
      else if (dem) push({ kind: 'single', contract: dem })
      else if (rep) push({ kind: 'single', contract: rep })
    } else {
      const c = find(entry.market)
      if (c) push({ kind: 'single', contract: c })
    }
  }
  return rows
}

export const conditionalRowContracts = (
  rows: MidtermConditionalRow[]
): Contract[] =>
  rows.flatMap((r) =>
    r.kind === 'pair' ? [r.ifDemocrats, r.ifRepublicans] : [r.contract]
  )

/**
 * The question two paired conditionals share, written once: "If Democrats win
 * the House in 2026, will X?" and "If Republicans keep the House in 2026, will
 * X?" give "Will X?". It is the longest common word-suffix of the two
 * questions after their "If …," clauses. If the questions do not share one,
 * fall back to the Democratic question after its condition (or whole).
 */
export function conditionalStem(demQuestion: string, repQuestion: string) {
  const afterCondition = (q: string) => {
    const match = q.match(/^\s*if\b[^,]*,\s*(.+)$/i)
    return (match ? match[1] : q).trim()
  }
  const a = afterCondition(demQuestion).split(/\s+/)
  const b = afterCondition(repQuestion).split(/\s+/)
  let n = 0
  while (
    n < a.length &&
    n < b.length &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  )
    n++
  const shared = n >= 3 ? a.slice(a.length - n).join(' ') : a.join(' ')
  return shared.charAt(0).toUpperCase() + shared.slice(1)
}
