import {
  ApprovalPoll,
  PublishedAverageSeries,
  hasApproveAnswer,
  readApprovePct,
} from 'common/perps/trump-approval'

import { log } from './utils'

// VoteHub API: https://polling.votehub.com/polls
// Returns a list of polls for a given subject. We use poll_type=approval,
// in_averages_only=true (their aggregator already excludes internal/partisan
// junk here), and filter by start_date. Each item has an `answers` array
// with { choice, pct }; we want "Approve". The poll's representative date
// is its `end_date` (last day of fielding) — not `created_at`, which is
// when the poll was published.
//
// This module is the ADAPTER only: it fetches and shapes. How the polls are
// then windowed and averaged is the published methodology and lives in
// common/perps/trump-approval.ts, where a UI can read the same rule the
// oracle prices against.

export type VoteHubPoll = {
  id: string
  poll_type: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  pollster: string
  subject: string
  answers: { choice: string; pct: number }[]
}

export const TRUMP_INAUGURATION_DATE = '2025-01-21'

const getApprovePct = (poll: VoteHubPoll): number | null => {
  const pct = readApprovePct(poll?.answers)
  // Distinguish "no Approve answer" (structural, not newsworthy) from a
  // percentage that cannot be a percentage. The latter is a provider
  // data-entry error and worth an ERROR: one pct of 460 against ~20 polls
  // near 45 moves the unweighted mean ~20 points, which lands inside the
  // feed's [10,90] plausibility bounds and would price live positions.
  if (pct == null && hasApproveAnswer(poll?.answers))
    log.error(
      `[trump-approval] dropping poll ${poll?.id} with unusable approve pct`
    )
  return pct
}

/**
 * Fetch every Trump approval poll from VoteHub since `startDate`.
 *
 * ONE REQUEST, DELIBERATELY. An earlier revision of this function paged by
 * `offset`, on the belief that the endpoint truncated silently — the giveaway
 * being that `items.length` comes back well under the reported `total` (26 of
 * 37 over 28 days, 57 of 69 over 56, 807 of 995 over the full history). That
 * was a misreading, and the paging it motivated made things worse rather than
 * better. What the response body actually does:
 *
 *   - `items` is COMPLETE. Verified across six range sizes from 2 polls to
 *     807: `items.length` always equals the distinct-id count, and the entire
 *     history since inauguration arrives in a single response.
 *   - `total` counts a different and larger population than `items` — it does
 *     not match the item count under any combination of the filters we send,
 *     including with `in_averages_only=false`. It is not a completeness
 *     signal, and any check comparing the two fires on every single request.
 *   - `offset` past the end of `items` does NOT return further rows. It
 *     returns byte-identical copies of rows already delivered, then empties.
 *     The "unstable sort producing duplicates" the paging loop deduplicated
 *     against was an artifact the loop itself created by requesting offsets
 *     that only existed in `total`'s larger population.
 *
 * So there is nothing to page and nothing to reconcile. Do not reintroduce a
 * loop here on the strength of `items.length < total` alone; confirm first
 * that distinct ids are actually missing, which so far they never are.
 *
 * The real backstop against a future truncation lives in the methodology
 * rather than here: selectApprovalWindow refuses to publish unless it finds
 * TRUMP_APPROVAL_MIN_POLLS within TRUMP_APPROVAL_MAX_WINDOW_DAYS. Truncation
 * would drop the OLDEST polls (responses arrive newest-first), which is
 * exactly what a widened window reaches for, so a short read surfaces as a
 * refusal to publish rather than as a quietly wrong average.
 */
export const fetchTrumpApprovalPolls = async (
  startDate: string
): Promise<VoteHubPoll[]> => {
  const url = new URL('https://polling.votehub.com/polls')
  url.searchParams.set('poll_type', 'approval')
  url.searchParams.set('subject', 'Donald Trump')
  url.searchParams.set('in_averages_only', 'true')
  url.searchParams.set('start_date', startDate)

  const response = await fetch(url.toString(), {
    headers: {
      accept: '*/*',
      // VoteHub's CORS is locked to the votehub.com origin in browsers, but
      // server-to-server requests don't need Origin. Setting a user-agent
      // is polite.
      'user-agent': 'Manifold/1.0 (+https://manifold.markets)',
    },
    // Without this a slow-trickling response never times out (undici's body
    // timeout resets per chunk), the daily job never finishes, and croner's
    // `protect` then silently skips subsequent firings with only a warning —
    // below the ERROR severity that alerting pages on. Every sibling adapter
    // sets a timeout; this one did not.
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(
      `VoteHub request failed: ${response.status} ${response.statusText}`
    )
  }
  const body = (await response.json()) as {
    items: VoteHubPoll[]
    total: number
  }
  const items = Array.isArray(body.items) ? body.items : []
  const distinct = new Set(items.map((poll) => poll?.id)).size

  // Log the oldest date reached, not `total`: coverage of the window we are
  // about to price is the property that matters, and it is the one a future
  // truncation would visibly break.
  const oldest = items.reduce<string | null>(
    (acc, poll) => (acc == null || poll?.end_date < acc ? poll?.end_date : acc),
    null
  )
  log(
    `fetched ${items.length} Trump approval polls from VoteHub ` +
      `(start_date=${startDate}, oldest end_date ${oldest ?? 'n/a'})`
  )
  // Distinct ids have always equalled the item count. If that ever changes,
  // the response really is repeating rows and the assumptions above need
  // revisiting — so say so loudly rather than silently deduplicating.
  if (distinct !== items.length)
    log.error(
      `[trump-approval] VoteHub returned ${items.length} rows but only ${distinct} distinct ids`
    )
  return items
}

/** VoteHub's key for the Trump approval average. */
export const VOTEHUB_TRUMP_APPROVAL_KEY = 'trump_approval'

/**
 * Fetch VoteHub's published, time-weighted approval average.
 *
 * This is the oracle price. The raw `/polls` feed above is still read, but
 * only to compute the independent cross-check described in
 * common/perps/trump-approval.ts — it no longer sets the price.
 *
 * Returns the whole series (one entry per day back to inauguration, ~50KB).
 * There is no "latest only" parameter, and the full payload is small enough
 * that adding one would be optimising the wrong thing: having the history in
 * hand is what lets readPublishedApprovalAverage tell "posted late today" from
 * "stopped updating three days ago".
 */
export const fetchTrumpApprovalAverage =
  async (): Promise<PublishedAverageSeries> => {
    const url = `https://polling.votehub.com/averages/${VOTEHUB_TRUMP_APPROVAL_KEY}/values`

    const response = await fetch(url, {
      headers: {
        accept: '*/*',
        'user-agent': 'Manifold/1.0 (+https://manifold.markets)',
      },
      // Same reasoning as the polls fetch: without an explicit timeout a
      // slow-trickling body never resolves, the job never finishes, and
      // croner's `protect` silently skips later firings at WARN severity.
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      throw new Error(
        `VoteHub averages request failed: ${response.status} ${response.statusText}`
      )
    }
    const body = (await response.json()) as PublishedAverageSeries
    log(
      `fetched VoteHub published approval average ` +
        `(${Object.keys(body ?? {}).length} daily points)`
    )
    return body
  }

/** Shape VoteHub rows into the methodology's input, dropping unusable ones. */
export const toApprovalPolls = (polls: VoteHubPoll[]): ApprovalPoll[] =>
  polls.flatMap((poll) => {
    const pct = getApprovePct(poll)
    if (pct == null) return []
    return [{ endDate: poll.end_date, pct, pollster: poll.pollster }]
  })
