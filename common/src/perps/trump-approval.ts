import { DAY_MS } from '../util/time'

// The Trump approval index: VoteHub's published, time-weighted polling
// average, mirrored as the oracle price.
//
// This file is the published methodology, not an implementation detail — the
// same reasoning as open-weight-models.ts. It lives in `common` (a leaf
// package) so the rule the oracle is scored against is one auditable artifact
// that a UI can render directly, rather than a description in a market blurb
// that drifts from the code that actually prices the market.
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
// live market with nobody noticing. So the window code below still runs, on
// the same raw polls, and its result is compared against theirs. It never sets
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

/** Trailing window, in whole days, that the index averages over. */
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
 * Hitting this cap means the feed publishes nothing and goes stale, which
 * pauses the engine: a visible, safe stop, and strictly better than pricing a
 * leveraged market off four polls from five weeks ago.
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

export type ApprovalPoll = {
  /**
   * Last day of fielding (YYYY-MM-DD) — the poll's representative date. Not
   * the publication date: when a poll becomes visible says something about
   * the pollster's release schedule, not about when opinion was measured.
   */
  endDate: string
  /** Approve percentage, on a 0-100 scale. */
  pct: number
  /** Attribution and display only. Never affects selection or weighting. */
  pollster?: string
}

export type ApprovalWindow = {
  /** The selected polls, newest end_date first. */
  polls: ApprovalPoll[]
  /** Inclusive earliest end_date admitted (YYYY-MM-DD). */
  startDate: string
  /** Inclusive latest end_date admitted — the valuation day (YYYY-MM-DD). */
  endDate: string
  /** Whole days spanned, inclusive of both ends. */
  spanDays: number
  /** Whether the count floor widened the window past the base window. */
  extended: boolean
}

export type ApprovalWindowResult =
  | { ok: true; window: ApprovalWindow }
  | { ok: false; reason: string }

export type ApprovalPointResult =
  | { ok: true; price: number; window: ApprovalWindow }
  | { ok: false; reason: string }

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Calendar dates are compared and shifted as UTC midnights, never as local
 * instants. Both operations then have no DST to be wrong about, and because
 * every date is zero-padded ISO, string ordering is already chronological
 * ordering — so membership tests need no parsing at all.
 */
const parseDay = (date: string): number | null => {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  // Date.parse is lenient about impossible calendar dates: '2026-02-31'
  // silently rolls forward to March 3 rather than returning NaN. Round-trip
  // the result so a provider typo is rejected instead of being quietly
  // reinterpreted as a different day at the window boundary.
  return new Date(ms).toISOString().slice(0, 10) === date ? ms : null
}

const shiftDay = (date: string, days: number): string | null => {
  const ms = parseDay(date)
  if (ms == null) return null
  const shifted = ms + days * DAY_MS
  if (!Number.isFinite(shifted)) return null
  return new Date(shifted).toISOString().slice(0, 10)
}

const daysBetween = (from: string, to: string): number | null => {
  const a = parseDay(from)
  const b = parseDay(to)
  if (a == null || b == null) return null
  return Math.round((b - a) / DAY_MS)
}

/**
 * A poll is usable if it reports a percentage that could be a percentage.
 *
 * The provider response is cast rather than schema-validated, so a data-entry
 * error arrives as an ordinary number. One pct of 460 against ~20 polls near
 * 40 moves the mean by ~20 points, which lands inside the feed's [10,90]
 * plausibility bounds and would price live positions.
 */
export const isUsableApprovalPoll = (poll: ApprovalPoll): boolean =>
  poll != null &&
  parseDay(poll.endDate) != null &&
  typeof poll.pct === 'number' &&
  Number.isFinite(poll.pct) &&
  poll.pct >= 0 &&
  poll.pct <= 100

/**
 * VoteHub's published average series, keyed by ISO day.
 *
 * Typed loosely on purpose: this is an external payload, so every field is
 * treated as absent-or-wrong until checked rather than trusted through a cast.
 */
export type PublishedAverageSeries = Record<
  string,
  { approve?: { average?: number } | null } | null | undefined
>

export type PublishedAverageResult =
  | { ok: true; price: number; asOfDay: string; ageDays: number }
  | { ok: false; reason: string }

/**
 * Read the most recent published average at or before `day`.
 *
 * Takes the latest available entry rather than requiring one stamped `day`,
 * because the provider posts a same-day value at an hour we do not control and
 * a missing entry at 5:30am Pacific is routine, not a fault. Age is then
 * checked explicitly — see TRUMP_APPROVAL_MAX_SOURCE_AGE_DAYS — so "slightly
 * behind" and "stopped updating" get different answers.
 */
export const readPublishedApprovalAverage = (
  series: PublishedAverageSeries | null | undefined,
  day: string,
  options: { maxAgeDays?: number } = {}
): PublishedAverageResult => {
  const { maxAgeDays = TRUMP_APPROVAL_MAX_SOURCE_AGE_DAYS } = options

  if (parseDay(day) == null)
    return { ok: false, reason: `invalid valuation day ${day}` }
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0)
    return { ok: false, reason: `invalid maxAgeDays ${maxAgeDays}` }
  if (series == null || typeof series !== 'object')
    return { ok: false, reason: 'published average series is missing' }

  let best: { asOfDay: string; price: number } | null = null
  for (const [key, entry] of Object.entries(series)) {
    if (parseDay(key) == null || key > day) continue
    const average = entry?.approve?.average
    // A percentage of exactly 0 or 100 is not a real approval reading; it is
    // the shape a cleared or defaulted field takes.
    if (
      typeof average !== 'number' ||
      !Number.isFinite(average) ||
      average <= 0 ||
      average >= 100
    )
      continue
    if (!best || key > best.asOfDay) best = { asOfDay: key, price: average }
  }

  if (!best)
    return {
      ok: false,
      reason: `no usable published average on or before ${day}`,
    }

  const ageDays = daysBetween(best.asOfDay, day)
  if (ageDays == null)
    return { ok: false, reason: `could not measure age of ${best.asOfDay}` }
  if (ageDays > maxAgeDays)
    return {
      ok: false,
      reason: `published average is ${ageDays} days stale (as of ${best.asOfDay}, max ${maxAgeDays})`,
    }

  return { ok: true, price: best.price, asOfDay: best.asOfDay, ageDays }
}

/**
 * Every usable day of the published series, oldest first.
 *
 * Shares its validity rules with readPublishedApprovalAverage so a backfill
 * and the daily job cannot disagree about which entries are real.
 */
export const readPublishedApprovalSeries = (
  series: PublishedAverageSeries | null | undefined
): { day: string; price: number }[] => {
  if (series == null || typeof series !== 'object') return []
  return Object.entries(series)
    .flatMap(([key, entry]) => {
      if (parseDay(key) == null) return []
      const average = entry?.approve?.average
      if (
        typeof average !== 'number' ||
        !Number.isFinite(average) ||
        average <= 0 ||
        average >= 100
      )
        return []
      return [{ day: key, price: average }]
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/**
 * Absolute distance between the published average and our own computation,
 * or null when either side is unusable — which is "no opinion", not "agrees".
 */
export const getApprovalCrossCheckGap = (
  published: number,
  reference: number
): number | null => {
  if (!Number.isFinite(published) || !Number.isFinite(reference)) return null
  const gap = Math.abs(published - reference)
  return Number.isFinite(gap) ? gap : null
}

/** One row of a provider's answer array, before any validation. */
export type ApprovalAnswer = { choice: string; pct: number }

const findApprove = (answers: readonly ApprovalAnswer[] | undefined) =>
  Array.isArray(answers)
    ? answers.find(
        (answer) =>
          typeof answer?.choice === 'string' &&
          answer.choice.toLowerCase() === 'approve'
      )
    : undefined

/**
 * Whether the provider offered an Approve row at all.
 *
 * Separate from reading it, so a caller can tell "this poll asks a different
 * question" (ordinary, silent) from "this poll answers our question with a
 * number that cannot be a percentage" (a data error worth alerting on).
 */
export const hasApproveAnswer = (
  answers: readonly ApprovalAnswer[] | undefined
): boolean => findApprove(answers) != null

/**
 * Read the Approve percentage, or null when it is absent or unusable.
 *
 * Lives here rather than in the backend adapter because it is the point where
 * provider data becomes oracle input, and the repo has no test runner under
 * backend/shared to pin that behaviour.
 */
export const readApprovePct = (
  answers: readonly ApprovalAnswer[] | undefined
): number | null => {
  const approve = findApprove(answers)
  if (!approve || typeof approve.pct !== 'number') return null
  if (!Number.isFinite(approve.pct) || approve.pct < 0 || approve.pct > 100)
    return null
  return approve.pct
}

/**
 * Choose the polls that price `day`.
 *
 * The base window is the TRUMP_APPROVAL_WINDOW_DAYS days ending on `day`. If
 * that holds at least TRUMP_APPROVAL_MIN_POLLS polls it is used unchanged.
 * Otherwise the window widens to the end_date of the Nth most recent poll.
 *
 * That cut is taken by DATE and is tie-inclusive: every poll sharing the
 * cut-off end_date is admitted, so the result never depends on the input
 * order. Picking "the first N after sorting" would let two polls that ended
 * the same day be separated by nothing but array position — the same
 * order-dependence normalizeOraclePointBatch refuses to tolerate when
 * publishing points, and it matters more here because a tie at the boundary
 * is the common case (five polls ended 2026-07-27).
 *
 * Because the widened cut is defined by rank rather than by age, it does not
 * move as `day` advances. A drought therefore reselects exactly the same
 * polls tomorrow, and the price does not move until a poll actually arrives.
 */
export const selectApprovalWindow = (
  polls: readonly ApprovalPoll[],
  day: string,
  options: {
    windowDays?: number
    minPolls?: number
    maxWindowDays?: number
  } = {}
): ApprovalWindowResult => {
  const {
    windowDays = TRUMP_APPROVAL_WINDOW_DAYS,
    minPolls = TRUMP_APPROVAL_MIN_POLLS,
    maxWindowDays = TRUMP_APPROVAL_MAX_WINDOW_DAYS,
  } = options

  if (parseDay(day) == null)
    return { ok: false, reason: `invalid valuation day ${day}` }
  if (!Number.isFinite(windowDays) || windowDays < 1)
    return { ok: false, reason: `invalid windowDays ${windowDays}` }
  if (!Number.isFinite(minPolls) || minPolls < 1)
    return { ok: false, reason: `invalid minPolls ${minPolls}` }
  if (!Number.isFinite(maxWindowDays) || maxWindowDays < windowDays)
    return { ok: false, reason: `invalid maxWindowDays ${maxWindowDays}` }

  // A poll that ends after the valuation day cannot inform it. This also
  // keeps a provider's future-dated row out of a backfilled day.
  const eligible = polls
    .filter((poll) => isUsableApprovalPoll(poll) && poll.endDate <= day)
    .sort((a, b) =>
      a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0
    )

  if (eligible.length === 0)
    return { ok: false, reason: `no usable polls on or before ${day}` }

  const baseStart = shiftDay(day, -(windowDays - 1))
  const floorStart = shiftDay(day, -(maxWindowDays - 1))
  if (baseStart == null || floorStart == null)
    return { ok: false, reason: `could not derive window bounds for ${day}` }

  const inBase = eligible.filter((poll) => poll.endDate >= baseStart)

  let startDate = baseStart
  let extended = false
  if (inBase.length < minPolls) {
    // eligible is sorted newest-first, so index minPolls-1 is the Nth most
    // recent poll. With fewer than N polls in total, reach as far as the data
    // goes and let the count check below decide whether that is publishable.
    const cut =
      eligible.length >= minPolls
        ? eligible[minPolls - 1].endDate
        : eligible[eligible.length - 1].endDate
    // Never narrower than the base window: the floor may only widen.
    if (cut < baseStart) {
      startDate = cut
      extended = true
    }
  }

  if (startDate < floorStart)
    return {
      ok: false,
      reason:
        `only ${
          eligible.filter((p) => p.endDate >= floorStart).length
        } polls ` + `within ${maxWindowDays} days of ${day}, need ${minPolls}`,
    }

  const selected = eligible.filter((poll) => poll.endDate >= startDate)
  // Unconditional, NOT gated on `extended`. When the base window already
  // covers every poll we hold, no widening happens and `extended` stays
  // false — so gating here would wave a three-poll average straight through
  // the floor that is the entire point of this function.
  if (selected.length < minPolls)
    return {
      ok: false,
      reason: `only ${selected.length} polls available on or before ${day}, need ${minPolls}`,
    }

  const spanDays = daysBetween(startDate, day)
  if (spanDays == null)
    return { ok: false, reason: `could not measure window span for ${day}` }

  return {
    ok: true,
    window: {
      polls: selected,
      startDate,
      endDate: day,
      spanDays: spanDays + 1,
      extended,
    },
  }
}

/** Unweighted mean of Approve pct. Null rather than NaN on an empty set. */
export const averageApprovalPct = (
  polls: readonly ApprovalPoll[]
): number | null => {
  const usable = polls.filter(isUsableApprovalPoll)
  if (usable.length === 0) return null
  const mean = usable.reduce((sum, poll) => sum + poll.pct, 0) / usable.length
  return Number.isFinite(mean) ? mean : null
}

/** Select the window for `day` and average it. */
export const computeApprovalPoint = (
  polls: readonly ApprovalPoll[],
  day: string,
  options?: Parameters<typeof selectApprovalWindow>[2]
): ApprovalPointResult => {
  const selection = selectApprovalWindow(polls, day, options)
  if (!selection.ok) return selection

  const price = averageApprovalPct(selection.window.polls)
  if (price == null)
    return { ok: false, reason: `could not average the window for ${day}` }

  return { ok: true, price, window: selection.window }
}

/**
 * How long a published point may stand before we re-publish an unchanged
 * value purely to prove the feed is alive.
 *
 * Publishing only on change is what closes the intraday arbitrage window, but
 * on its own it would starve the feed during a flat stretch — VoteHub's
 * average genuinely held 38.4 for three straight days in August 2026 — and
 * staleness alerting keys on ROW age. So a value that has not moved is
 * re-stamped twice a day, comfortably inside the feed's 26h staleAfterMs and
 * the market's 30h maxOraclePriceAgeMs.
 */
export const TRUMP_APPROVAL_HEARTBEAT_MS = 12 * 60 * 60 * 1000

export type ApprovalPublishDecision =
  | { publish: true; reason: 'first' | 'changed' | 'heartbeat' }
  | { publish: false; reason: string }

/**
 * Should this reading be written as a new oracle point?
 *
 * The old rule published the first usable value of each Pacific day and then
 * stopped, which left every later move by the source sitting in public view
 * as the exact next day's mark — the same shape of timing edge this feed was
 * changed to remove, just relocated from the window to the schedule. So the
 * job now runs hourly and publishes whenever the value actually moves.
 *
 * Prices are compared exactly rather than within an epsilon: the source
 * publishes to one decimal, so any real move is at least 0.1, and rounding
 * slack here would silently swallow the smallest genuine moves.
 */
export const decideApprovalPublish = (args: {
  price: number
  last: { price: number; ts: number } | null
  now: number
  heartbeatMs?: number
}): ApprovalPublishDecision => {
  const { price, last, now, heartbeatMs = TRUMP_APPROVAL_HEARTBEAT_MS } = args

  if (!Number.isFinite(price))
    return { publish: false, reason: `invalid price ${price}` }
  if (!Number.isFinite(now))
    return { publish: false, reason: `invalid now ${now}` }
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0)
    return { publish: false, reason: `invalid heartbeatMs ${heartbeatMs}` }
  if (!last) return { publish: true, reason: 'first' }
  if (!Number.isFinite(last.price) || !Number.isFinite(last.ts))
    return { publish: true, reason: 'first' }

  if (price !== last.price) return { publish: true, reason: 'changed' }
  if (now - last.ts >= heartbeatMs)
    return { publish: true, reason: 'heartbeat' }
  return {
    publish: false,
    reason: `unchanged at ${price} since ${new Date(last.ts).toISOString()}`,
  }
}
