import { TRUMP_APPROVAL_RULES } from 'common/perps/trump-approval'
import {
  AveragePoll,
  PublishedAverageSeries,
  VoteHubAverageRules,
  hasAnswer,
  readAnswerPct,
} from 'common/perps/votehub-average'

import {
  TRUMP_APPROVAL_FEED_ID,
  VANCE_FAVORABILITY_FEED_ID,
  VOTEHUB_GENERIC_BALLOT_2026_FEED_ID,
} from './oracle'
import { log } from './utils'

// VoteHub API adapter, parameterised by feed.
//
// VoteHub (https://votehub.com/polls/api/) publishes two things we read:
//
//   - `GET https://polling.votehub.com/polls` — the raw poll list for a
//     subject. We pass poll_type, subject, in_averages_only=true (their
//     aggregator already excludes internal/partisan junk here) and a
//     start_date. Each item has an `answers` array of { choice, pct }. The
//     poll's representative date is its `end_date` (last day of fielding),
//     not `created_at`, which is when the poll was published.
//   - `GET https://polling.votehub.com/averages/<key>/values` — their
//     published, time-weighted average, one entry per day keyed YYYY-MM-DD,
//     each entry an object keyed by answer (`approve`, `dem`, `favorable`...)
//     carrying `{ average }`. THIS is the oracle price; the raw polls only
//     feed the canary. `GET /averages` lists every available key.
//
// This module is the ADAPTER only: it fetches and shapes. How a series is
// read and how the canary windows the polls is the published methodology in
// common/perps/votehub-average.ts, where a UI can read the same rule the
// oracle prices against. The three feeds are described by a `VoteHubFeedSpec`
// each; the Trump spec reproduces the pre-generalisation feed exactly (same
// feed id, key, choice, constants, and `[trump-approval]` log prefix).
//
// Every request sets a timeout: without one a slow-trickling response never
// times out (undici's body timeout resets per chunk), the job never finishes,
// and croner's `protect` then silently skips subsequent firings with only a
// warning — below the ERROR severity that alerting pages on.

export const VOTEHUB_POLLING_API = 'https://polling.votehub.com'
export const VOTEHUB_TZ = 'America/Los_Angeles'
const USER_AGENT = 'Manifold/1.0 (+https://manifold.markets)'
const FETCH_TIMEOUT_MS = 30_000

export type VoteHubFeedSpec = {
  /** Oracle feed id (`oracle_prices.feed_id`). */
  feedId: string
  /** Human label for log lines: "Trump approval", "JD Vance favorability". */
  label: string
  /** Key under `/averages/<averageKey>/values`. */
  averageKey: string
  /** Answer object inside each day's entry whose `average` is the price. */
  answerKey: string
  /** `subject` query parameter on `/polls`, for the canary. */
  subject: string
  /** `poll_type` query parameter on `/polls`, for the canary. */
  pollType: string
  /** `answers[].choice` string the canary averages (matched case-insensitively). */
  pollAnswerChoice: string
  /** Bracketed prefix on every WARN/ERROR line; GCP alerting keys on it. */
  logPrefix: string
  /** Calendar days are Pacific, like the rest of the scheduler. */
  tz: typeof VOTEHUB_TZ
  rules: VoteHubAverageRules
}

export type VoteHubPoll = {
  id: string
  poll_type: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  pollster: string
  subject: string
  answers: { choice: string; pct: number }[]
}

/**
 * The original feed, unchanged. Key `trump_approval`, entries shaped
 * `{ approve: { average }, disapprove: { average } }`, raw polls
 * `poll_type=approval&subject=Donald Trump` with an `Approve` answer —
 * all verified in production since 2026-08.
 */
export const TRUMP_APPROVAL_SPEC: VoteHubFeedSpec = {
  feedId: TRUMP_APPROVAL_FEED_ID,
  label: 'Trump approval',
  averageKey: 'trump_approval',
  answerKey: 'approve',
  subject: 'Donald Trump',
  pollType: 'approval',
  pollAnswerChoice: 'Approve',
  logPrefix: '[trump-approval]',
  tz: VOTEHUB_TZ,
  rules: TRUMP_APPROVAL_RULES,
}

/**
 * Democratic share (%) of VoteHub's published 2026 generic-ballot average.
 *
 * ⚠️ KEY AND SHAPE NOT YET VERIFIED AGAINST A LIVE RESPONSE. This spec was
 * written on 2026-09-02 from a build environment whose egress policy blocks
 * polling.votehub.com, so the average key (`generic_ballot_2026`), the answer
 * key (`dem`) and the poll choice (`Dem`) are INFERRED from the pattern the
 * verified Trump feed follows (key `trump_approval`, answer key `approve`,
 * poll choice `Approve` — VoteHub keys the average's answer objects on the
 * lower-cased poll choice) and from the feed-id chosen for this market. Before
 * the backfill is run, confirm all three with
 * `backend/scripts/list-votehub-averages.ts`, which prints `GET /averages`
 * and the answer keys of each spec's latest entry, and correct this constant
 * if they differ. Nothing guesses at runtime: a wrong `averageKey` is an HTTP
 * 404 (fetch throws, job reports failure), a wrong `answerKey` reads as "no
 * usable published average" (nothing publishes), and a wrong
 * `pollAnswerChoice` only blinds the canary (publishes unchecked, with a
 * WARN naming the spec).
 *
 * The price is the DEMOCRATIC SHARE, never the D-minus-R margin: a margin
 * can be zero or negative, and an oracle price must be strictly positive.
 * If VoteHub only publishes a margin for this average — i.e. the entry has
 * no per-party answer object — this feed must not be launched; do not
 * synthesise a share from a margin.
 *
 * Rules start from the Trump numbers. Generic-ballot polling runs at a
 * comparable density to presidential approval in a midterm year, so the same
 * floor should engage about as rarely; revisit after the first month of
 * cross-check gaps has been observed.
 */
export const GENERIC_BALLOT_2026_SPEC: VoteHubFeedSpec = {
  feedId: VOTEHUB_GENERIC_BALLOT_2026_FEED_ID,
  label: '2026 generic ballot (Democratic share)',
  averageKey: 'generic_ballot_2026',
  answerKey: 'dem',
  subject: '2026',
  pollType: 'generic-ballot',
  pollAnswerChoice: 'Dem',
  logPrefix: '[votehub]',
  tz: VOTEHUB_TZ,
  rules: { ...TRUMP_APPROVAL_RULES },
}

/**
 * Favorable (%) from VoteHub's published JD Vance favorability average.
 *
 * ⚠️ KEY AND SHAPE NOT YET VERIFIED AGAINST A LIVE RESPONSE — same caveat and
 * same verification step as GENERIC_BALLOT_2026_SPEC (2026-09-02). Inferred:
 * average key `vance_favorability` (by analogy with `trump_approval`), answer
 * key `favorable`, poll choice `Favorable`.
 *
 * Rules start from the Trump numbers. Favorability polling for a vice
 * president is thinner than presidential approval, so expect the canary to
 * report "unchecked" more often than Trump's does — that is a WARN per
 * publication, never a refusal to publish, because a canary that cannot be
 * computed has no opinion. If the first backfill dry run shows the floor
 * failing on most days, widen `maxWindowDays` HERE (not in the Trump rules)
 * and say why in this comment.
 */
export const VANCE_FAVORABILITY_SPEC: VoteHubFeedSpec = {
  feedId: VANCE_FAVORABILITY_FEED_ID,
  label: 'JD Vance favorability',
  averageKey: 'vance_favorability',
  answerKey: 'favorable',
  subject: 'JD Vance',
  pollType: 'favorability',
  pollAnswerChoice: 'Favorable',
  logPrefix: '[votehub]',
  tz: VOTEHUB_TZ,
  rules: { ...TRUMP_APPROVAL_RULES },
}

/**
 * The feeds published by the `update-votehub-averages` job. Trump is NOT in
 * this list: it keeps its own job, name and log prefix, because GCP alert
 * policies are keyed on `[trump-approval]` and `update-trump-approval`.
 */
export const VOTEHUB_FEED_SPECS: readonly VoteHubFeedSpec[] = [
  GENERIC_BALLOT_2026_SPEC,
  VANCE_FAVORABILITY_SPEC,
]

/** Every VoteHub spec, for the scripts and the spec-table test. */
export const ALL_VOTEHUB_FEED_SPECS: readonly VoteHubFeedSpec[] = [
  TRUMP_APPROVAL_SPEC,
  ...VOTEHUB_FEED_SPECS,
]

export const getVoteHubFeedSpec = (feedId: string) =>
  ALL_VOTEHUB_FEED_SPECS.find((spec) => spec.feedId === feedId)

const voteHubFetch = async (url: string, what: string) => {
  const response = await fetch(url, {
    headers: {
      accept: '*/*',
      // VoteHub's CORS is locked to the votehub.com origin in browsers, but
      // server-to-server requests don't need Origin. Setting a user-agent
      // is polite.
      'user-agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok)
    throw new Error(
      `VoteHub ${what} request failed: ${response.status} ${response.statusText}`
    )
  return response.json() as Promise<unknown>
}

/**
 * Fetch every poll for the spec's subject since `startDate`.
 *
 * ONE REQUEST, DELIBERATELY. An earlier revision of the Trump fetcher paged by
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
 *
 * So there is nothing to page and nothing to reconcile. Do not reintroduce a
 * loop here on the strength of `items.length < total` alone; confirm first
 * that distinct ids are actually missing, which so far they never are.
 *
 * The real backstop against a future truncation lives in the methodology
 * rather than here: selectPollWindow refuses to produce a canary unless it
 * finds `minPolls` within `maxWindowDays`. Truncation would drop the OLDEST
 * polls (responses arrive newest-first), which is exactly what a widened
 * window reaches for, so a short read surfaces as an unchecked publication
 * rather than as a quietly wrong canary.
 */
export const fetchVoteHubPolls = async (
  spec: VoteHubFeedSpec,
  startDate: string
): Promise<VoteHubPoll[]> => {
  const url = new URL(`${VOTEHUB_POLLING_API}/polls`)
  url.searchParams.set('poll_type', spec.pollType)
  url.searchParams.set('subject', spec.subject)
  url.searchParams.set('in_averages_only', 'true')
  url.searchParams.set('start_date', startDate)

  const body = (await voteHubFetch(url.toString(), 'polls')) as {
    items?: VoteHubPoll[]
    total?: number
  }
  const items = Array.isArray(body?.items) ? body.items : []
  const distinct = new Set(items.map((poll) => poll?.id)).size

  // Log the oldest date reached, not `total`: coverage of the window we are
  // about to price is the property that matters, and it is the one a future
  // truncation would visibly break.
  const oldest = items.reduce<string | null>(
    (acc, poll) => (acc == null || poll?.end_date < acc ? poll?.end_date : acc),
    null
  )
  log(
    `fetched ${items.length} ${spec.label} polls from VoteHub ` +
      `(start_date=${startDate}, oldest end_date ${oldest ?? 'n/a'})`
  )
  // Distinct ids have always equalled the item count. If that ever changes,
  // the response really is repeating rows and the assumptions above need
  // revisiting — so say so loudly rather than silently deduplicating.
  if (distinct !== items.length)
    log.error(
      `${spec.logPrefix} VoteHub returned ${items.length} rows but only ${distinct} distinct ids for ${spec.feedId}`
    )
  return items
}

/**
 * Fetch VoteHub's published, time-weighted average for the spec.
 *
 * This is the oracle price. The raw `/polls` feed above is still read, but
 * only to compute the independent cross-check described in
 * common/perps/votehub-average.ts — it never sets the price.
 *
 * Returns the whole series (one entry per day, ~50KB for Trump). There is no
 * "latest only" parameter, and the full payload is small enough that adding
 * one would be optimising the wrong thing: having the history in hand is what
 * lets readPublishedAverage tell "posted late today" from "stopped updating
 * three days ago".
 */
export const fetchVoteHubAverage = async (
  spec: VoteHubFeedSpec
): Promise<PublishedAverageSeries> => {
  const url = `${VOTEHUB_POLLING_API}/averages/${encodeURIComponent(
    spec.averageKey
  )}/values`
  const body = (await voteHubFetch(url, 'averages')) as PublishedAverageSeries
  log(
    `fetched VoteHub published ${spec.label} average ` +
      `(${Object.keys(body ?? {}).length} daily points)`
  )
  return body
}

/**
 * `GET /averages` — VoteHub's list of every published average. Discovery only
 * (see backend/scripts/list-votehub-averages.ts); nothing on the price path
 * calls this, so its shape is left untyped.
 */
export const fetchVoteHubAverageList = async (): Promise<unknown> =>
  voteHubFetch(`${VOTEHUB_POLLING_API}/averages`, 'averages list')

const getTrackedPct = (spec: VoteHubFeedSpec, poll: VoteHubPoll) => {
  const pct = readAnswerPct(poll?.answers, spec.pollAnswerChoice)
  // Distinguish "no such answer" (structural, not newsworthy) from a
  // percentage that cannot be a percentage. The latter is a provider
  // data-entry error and worth an ERROR: one pct of 460 against ~20 polls
  // near 45 moves the unweighted mean ~20 points, which lands inside the
  // feed's plausibility bounds and would blind the canary.
  if (pct == null && hasAnswer(poll?.answers, spec.pollAnswerChoice))
    log.error(
      `${spec.logPrefix} dropping poll ${
        poll?.id
      } with unusable ${spec.pollAnswerChoice.toLowerCase()} pct`
    )
  return pct
}

/** Shape VoteHub rows into the methodology's input, dropping unusable ones. */
export const toVoteHubPolls = (
  spec: VoteHubFeedSpec,
  polls: VoteHubPoll[]
): AveragePoll[] =>
  polls.flatMap((poll) => {
    const pct = getTrackedPct(spec, poll)
    if (pct == null) return []
    return [{ endDate: poll.end_date, pct, pollster: poll.pollster }]
  })
