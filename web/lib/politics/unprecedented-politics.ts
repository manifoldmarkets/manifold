import { keyBy, uniqBy } from 'lodash'

import { Contract } from 'common/contract'

import { isOpenPublicMarket } from './election-curation'

// "Unprecedented politics" on /election: community markets on things that have
// not happened before in American politics (troops at polling places, a third
// term, a postponed election, a president defying the Supreme Court…) with the
// market's odds that they happen now. Hand-curated: no contract field marks a
// market as unprecedented, and the good ones are few. Entries are slugs in
// display order. The first UNPRECEDENTED_POLITICS_SIZE that are open and public
// are shown; the rest are spares, so when a market closes (the national
// emergency one closes at the midterms) the next slides in without a deploy. A
// market that has resolved, closed, gone private or does not exist is skipped
// silently.
//
// Picked from prod on 2026-10-13: open, public, binary, none in the Midterm
// Contest topic or the conditional matrices. Trader counts as of that day.
// Markets conditional on a party winning both chambers (e.g. the $5,000
// checks) belong in the Congress matrix's Both view instead
// (BOTH_2026_MATRIX in conditional-matrix.ts).

export const UNPRECEDENTED_POLITICS_SIZE = 8

export const UNPRECEDENTED_POLITICS_SLUGS: string[] = [
  // Will there be troops or federal agents at US voting booths in 2026 or
  // 2028? (267 traders)
  'will-there-be-pressure-by-troops-or',
  // Will Federal Agents draw guns on voters on Election Day 2026? (10; closes
  // Nov 4, 2026, so it leaves with the midterms)
  'will-federal-agents-draw-guns-on-vo',
  // Will Trump declare a national emergency before the midterms? (146; closes
  // Nov 2, 2026)
  'will-trump-declare-a-national-emerg-qphcUqSlZZ',
  // If Dems win the House or Senate in 2026, will officials try to block a
  // working Democratic majority from being seated? (111; N/A unless Democrats
  // win a chamber)
  'if-democrats-win-the-house-or-senat',
  // Trump seriously attempts 3rd term in 2028? (460)
  'trump-seriously-attempts-3rd-term-i',
  // Will Trump invoke the Insurrection Act during his second term? (157)
  'will-trump-invoke-the-insurrection',
  // Will a sitting US President refuse to follow or ignore a Supreme Court
  // ruling by 2032? (92)
  'will-a-sitting-us-president-refuse',
  // In 2028, will AI be at least as big a political issue as abortion? (2,718)
  'in-2028-will-ai-be-at-least-as-big',

  // Spares, in order.
  // Will Donald Trump attempt to suspend, delay, or reschedule the 2028
  // elections? (107)
  'will-donald-trump-attempt-to-suspen',
  // Will Donald Trump publicly call for a global halt in AI progress before
  // 2028? (65) The AI-pause angle: the closest politically framed market.
  'will-donald-trump-publicly-call-for',
  // Will Trump/USA buy or acquire part of Greenland? (1,270)
  'will-trump-buy-greenland',
  // Will the United States experience a constitutional crisis before 2030?
  // (152)
  'will-the-united-states-experience-a',
  // Will President Trump be declared incapacitated under the 25th Amendment
  // Section 4 during the 2025-2029 term? (209)
  'will-the-next-president-be-declared',
]

/**
 * The markets to show, in curated order: open and public, not already shown
 * elsewhere on the page (`excludeIds`), at most `limit`. `fetched` is whatever
 * the loader found for the slugs. Pure, so it can be unit tested and re-run on
 * every ISR revalidation.
 */
export function pickUnprecedentedPolitics(
  fetched: Contract[],
  options: {
    now: number
    excludeIds?: string[]
    slugs?: string[]
    limit?: number
  }
): Contract[] {
  const {
    now,
    excludeIds = [],
    slugs = UNPRECEDENTED_POLITICS_SLUGS,
    limit = UNPRECEDENTED_POLITICS_SIZE,
  } = options
  const bySlug = keyBy(
    uniqBy(fetched, (c) => c.id),
    (c) => c.slug
  )
  const picked: Contract[] = []
  for (const slug of slugs) {
    if (picked.length >= limit) break
    const contract = bySlug[slug]
    if (
      !contract ||
      !isOpenPublicMarket(contract, now) ||
      excludeIds.includes(contract.id) ||
      picked.some((p) => p.id === contract.id)
    )
      continue
    picked.push(contract)
  }
  return picked
}
