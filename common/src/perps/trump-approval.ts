import {
  DAILY_FEED_HEARTBEAT_MS,
  DailyFeedPublishDecision,
  decideDailyFeedPublish,
} from './daily-feed-publish'
import {
  AveragePoll,
  PollAnswer,
  PollAveragePointResult,
  PollWindow,
  PollWindowResult,
  PublishedAverageResult as VoteHubPublishedAverageResult,
  PublishedAverageSeries as VoteHubPublishedAverageSeries,
  VoteHubAverageRules,
  averagePollPct,
  computePollAveragePoint,
  getCrossCheckGap,
  hasAnswer,
  isUsablePoll,
  readAnswerPct,
  readPublishedAverage,
  readPublishedSeries,
  selectPollWindow,
} from './votehub-average'

// The Trump approval index: VoteHub's published, time-weighted polling
// average, mirrored as the oracle price.
//
// This file is the published methodology, not an implementation detail — the
// same reasoning as open-weight-models.ts. It lives in `common` (a leaf
// package) so the rule the oracle is scored against is one auditable artifact
// that a UI can render directly, rather than a description in a market blurb
// that drifts from the code that actually prices the market.
//
// The mechanics — reading the published series, the poll-window canary, the
// cross-check gap, the publish-on-change rule — are shared with the other
// VoteHub feeds (2026 generic ballot, Vance favorability) and live in
// `votehub-average.ts` and `daily-feed-publish.ts`, parameterised by the
// answer key. Everything exported from here is the Trump-specific
// instantiation: the constants below, whose values were set from this feed's
// observed history, and thin wrappers that behave exactly as this module did
// before the generalisation (its test file is unchanged and still passes).
//
// WHY WE MIRROR RATHER THAN COMPUTE
//
// We used to compute our own unweighted mean of the Approve percentage across
// polls in a trailing 14-day window. That estimator had two problems, and
// only one of them was fixable by us.
//
// The first was a timing exploit. Polls leave a fixed window on a schedule set
// by their end_date; they arrive on no schedule at all. So when polling goes
// quiet every daily move is a *departure*, and departures are public knowledge
// days ahead. Between 2026-08-10 and 2026-08-17 the window decayed from 11
// polls to 5 with nothing arriving, and the index rose from 38.38 to 40.00
// purely because the 2026-07-27 cluster (Quinnipiac 32, AP-NORC 33, CNN/SSRS
// 34, Global Strategy 37) expired. No poll moved up. Anyone reading the source
// list could compute the next several prints exactly, which on a market
// carrying leveraged positions is not a price but a standing invitation.
//
// The second was the level itself. An unweighted mean applies no recency,
// sample-size, or house-effect adjustment, so the mix of pollsters who happen
// to be in the window moves the number more than opinion does. That is why it
// read 40.0 while every public aggregate sat between 36 and 39.
//
// A time-weighted average fixes both at once, because weights decay instead of
// falling off a cliff: no scheduled expiry to trade against, and no single
// pollster worth a fixed fraction of the price. VoteHub already publishes one,
// computed by people who do this for a living. Mirroring it is strictly better
// than us maintaining a worse estimator — and it means the number a user sees
// on the market is the number they can look up on votehub.com, rather than
// something they have to take on trust from us. A settlement source the reader
// can verify in ten seconds is worth more than one we control.
//
// Measured against our old rule over the 554 days from 2025-02-10, their
// average is materially calmer: mean |day-over-day| 0.112 against our 0.174,
// max 0.90 against our 1.23.
//
// LICENCE
//
// VoteHub's polling API is published under Creative Commons Attribution 4.0
// International, stated on their API documentation. CC BY 4.0 permits reuse,
// redistribution, and derivative works, including commercially, on the single
// condition that the source is credited. We credit VoteHub with a link on the
// market page — see oracle-attribution.ts, which renders it as a component
// precisely so it cannot be edited away by accident.
//
// WE STILL COMPUTE OUR OWN AVERAGE — AS A CANARY, NOT AS THE PRICE
//
// Mirroring a third party means a silent change on their side would reprice a
// live market with nobody noticing. So the window code still runs, on the
// same raw polls, and its result is compared against theirs. It never sets
// the price; it exists to answer "does their number still look like a Trump
// approval average?" Over 554 days the two differ by a median of 0.435 and
// never by more than 1.70, so a large divergence means something broke — a
// units change, an approve/disapprove swap, a methodology rewrite — and the
// feed stops rather than publishing a number we cannot corroborate.
//
// The floor and max-window rules on that computation are kept for the same
// reason they were introduced: they stop the CANARY from going haywire during
// a polling drought and raising a false alarm against a perfectly good
// published value.
//
// Note on funding, since publishing more often changes its timing: the
// maximum cadence is unchanged, because shouldApplyFunding gates on elapsed
// time against the contract's own fundingPeriodMs. What changes is that its
// second condition for slow periods — a new oracle point since the last
// funding event — is now reliably satisfied, so DELAYED funding events become
// less likely. Historically that mattered: the 2026-08-14 event due at 21:00
// PT waited until 04:00 the next day for the first new point, making that
// interval 26 hours.

/** The answer object inside each day of VoteHub's `trump_approval` series. */
export const TRUMP_APPROVAL_ANSWER_KEY = 'approve'

/** The `answers[].choice` string on a raw approval poll. */
export const TRUMP_APPROVAL_POLL_CHOICE = 'Approve'

/** Trailing window, in whole days, that the canary averages over. */
export const TRUMP_APPROVAL_WINDOW_DAYS = 14

/**
 * Minimum polls the window must contain before it is allowed to be only
 * TRUMP_APPROVAL_WINDOW_DAYS wide.
 *
 * Set from the observed distribution rather than taste. Over the 560 days
 * from 2025-02-04 the 14-day poll count ran: min 5, p5 11, p25 17, median 20,
 * max 31. A floor of 12 sits just above the 5th percentile, so it engages
 * only in a genuine drought (7.1% of days) and leaves the plain 14-day mean
 * intact the rest of the time. It also bounds single-pollster influence: at
 * 12 polls no one house effect is worth more than ~1/12 of the price, where
 * at the 5 polls seen on 2026-08-17 one Morning Consult print was worth 20%.
 */
export const TRUMP_APPROVAL_MIN_POLLS = 12

/**
 * Hard cap on how far the window may reach back to satisfy the floor.
 *
 * Reaching further does not make the number better — past some age the polls
 * are describing a different month. The observed worst case needed 22 days,
 * so 35 leaves real headroom while still failing closed on a source outage.
 * Hitting this cap means the canary publishes nothing: the published value
 * then goes out unchecked, with a WARN saying so.
 */
export const TRUMP_APPROVAL_MAX_WINDOW_DAYS = 35

/**
 * How stale VoteHub's own latest datapoint may be before we stop publishing.
 *
 * This is the check the previous design was missing, and it is why a frozen
 * feed went unnoticed for a week: staleness was measured on OUR row age, and
 * we wrote a row every day regardless of whether the inputs had moved. A
 * source that stops updating must stop the feed, not be relaid daily under a
 * fresh timestamp.
 *
 * Their series carries a same-day entry most days and is at most a day behind
 * when we publish at 5:30am Pacific, so 3 days is slack for a weekend or a
 * short outage without tolerating a genuinely dead source.
 */
export const TRUMP_APPROVAL_MAX_SOURCE_AGE_DAYS = 3

/**
 * How far our independently computed average may sit from VoteHub's published
 * one before we refuse to publish.
 *
 * Set from the observed joint distribution, not taste: over the 554 days from
 * 2025-02-10 the two differ by a median of 0.435, p99 1.289, and a maximum of
 * 1.700. They are different estimators of the same quantity, so they are never
 * expected to agree exactly — 3.0 clears the entire observed range with room
 * to spare while still catching the failures worth catching. An approve /
 * disapprove swap moves it ~19 points; a 0-1 versus 0-100 units change moves
 * it ~38.
 *
 * A trip fails closed. The feed goes stale and the engine pauses, which is
 * visible and recoverable, where publishing a number two independent
 * computations disagree about is neither.
 */
export const TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP = 3

/**
 * How long a published point may stand before we re-publish an unchanged
 * value purely to prove the feed is alive. See DAILY_FEED_HEARTBEAT_MS; this
 * name is kept because the feed's alerting docs and tests refer to it.
 */
export const TRUMP_APPROVAL_HEARTBEAT_MS = DAILY_FEED_HEARTBEAT_MS

/** The full rule set, in the shape the backend's VoteHub feed spec carries. */
export const TRUMP_APPROVAL_RULES: VoteHubAverageRules = {
  windowDays: TRUMP_APPROVAL_WINDOW_DAYS,
  minPolls: TRUMP_APPROVAL_MIN_POLLS,
  maxWindowDays: TRUMP_APPROVAL_MAX_WINDOW_DAYS,
  maxSourceAgeDays: TRUMP_APPROVAL_MAX_SOURCE_AGE_DAYS,
  maxCrossCheckGap: TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP,
  heartbeatMs: TRUMP_APPROVAL_HEARTBEAT_MS,
}

export type ApprovalPoll = AveragePoll
export type ApprovalWindow = PollWindow
export type ApprovalWindowResult = PollWindowResult
export type ApprovalPointResult = PollAveragePointResult
export type PublishedAverageSeries = VoteHubPublishedAverageSeries
export type PublishedAverageResult = VoteHubPublishedAverageResult
/** One row of a provider's answer array, before any validation. */
export type ApprovalAnswer = PollAnswer
export type ApprovalPublishDecision = DailyFeedPublishDecision

export const isUsableApprovalPoll = (poll: ApprovalPoll): boolean =>
  isUsablePoll(poll)

/** Read the most recent published Approve average at or before `day`. */
export const readPublishedApprovalAverage = (
  series: PublishedAverageSeries | null | undefined,
  day: string,
  options: { maxAgeDays?: number } = {}
): PublishedAverageResult =>
  readPublishedAverage(series, day, {
    answerKey: TRUMP_APPROVAL_ANSWER_KEY,
    maxAgeDays: options.maxAgeDays ?? TRUMP_APPROVAL_MAX_SOURCE_AGE_DAYS,
  })

/** Every usable day of the published Approve series, oldest first. */
export const readPublishedApprovalSeries = (
  series: PublishedAverageSeries | null | undefined
): { day: string; price: number }[] =>
  readPublishedSeries(series, { answerKey: TRUMP_APPROVAL_ANSWER_KEY })

export const getApprovalCrossCheckGap = (
  published: number,
  reference: number
): number | null => getCrossCheckGap(published, reference)

export const hasApproveAnswer = (
  answers: readonly ApprovalAnswer[] | undefined
): boolean => hasAnswer(answers, TRUMP_APPROVAL_POLL_CHOICE)

export const readApprovePct = (
  answers: readonly ApprovalAnswer[] | undefined
): number | null => readAnswerPct(answers, TRUMP_APPROVAL_POLL_CHOICE)

export const selectApprovalWindow = (
  polls: readonly ApprovalPoll[],
  day: string,
  options: {
    windowDays?: number
    minPolls?: number
    maxWindowDays?: number
  } = {}
): ApprovalWindowResult =>
  selectPollWindow(polls, day, {
    windowDays: options.windowDays ?? TRUMP_APPROVAL_WINDOW_DAYS,
    minPolls: options.minPolls ?? TRUMP_APPROVAL_MIN_POLLS,
    maxWindowDays: options.maxWindowDays ?? TRUMP_APPROVAL_MAX_WINDOW_DAYS,
  })

export const averageApprovalPct = (
  polls: readonly ApprovalPoll[]
): number | null => averagePollPct(polls)

export const computeApprovalPoint = (
  polls: readonly ApprovalPoll[],
  day: string,
  options?: Parameters<typeof selectApprovalWindow>[2]
): ApprovalPointResult =>
  computePollAveragePoint(polls, day, {
    windowDays: options?.windowDays ?? TRUMP_APPROVAL_WINDOW_DAYS,
    minPolls: options?.minPolls ?? TRUMP_APPROVAL_MIN_POLLS,
    maxWindowDays: options?.maxWindowDays ?? TRUMP_APPROVAL_MAX_WINDOW_DAYS,
  })

export const decideApprovalPublish = (args: {
  price: number
  last: { price: number; ts: number } | null
  now: number
  heartbeatMs?: number
}): ApprovalPublishDecision => decideDailyFeedPublish(args)
