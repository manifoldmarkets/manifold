import { DAY_MS } from '../util/time'

// VoteHub published-average feeds: the methodology shared by every oracle
// that mirrors one of VoteHub's time-weighted polling averages as its price.
//
// Three feeds price off this module today — the Trump approval index
// (`trump-approval.ts`, which is where the reasoning for mirroring rather
// than computing is written up), the Democratic share of the 2026 generic
// ballot, and JD Vance's favorability. They differ only in WHICH published
// average they read and WHICH answer inside it is the price, so everything
// below takes the answer key as a parameter rather than hard-coding
// `approve`. The Trump-named exports are thin wrappers over these functions
// and behave exactly as they did before this generalisation.
//
// This file is the published methodology, not an implementation detail. It
// lives in `common` (a leaf package) so the rule the oracle is scored against
// is one auditable artifact that a UI can render directly, rather than a
// description in a market blurb that drifts from the code that actually
// prices the market.
//
// WHAT THE PRICE IS
//
// The oracle price is the `average` of ONE answer object in VoteHub's
// `/averages/<key>/values` series — the Approve share for approval, the
// Democratic share for the generic ballot, the Favorable share for
// favorability — read for the most recent day at or before the valuation day
// and rejected if that day is too far behind (`maxSourceAgeDays`). It is
// always a SHARE on a 0-100 scale, never a margin: a margin (D minus R,
// favorable minus unfavorable) can be zero or negative, and an oracle price
// must be strictly positive (validateBasicOraclePoint). A share also has no
// sign to get wrong.
//
// THE CANARY
//
// Mirroring a third party means a silent change on their side would reprice
// a live market with nobody noticing. So the poll-window code below still
// runs on the same raw polls and its unweighted mean is compared against the
// published value. It never sets the price; it exists to answer "does their
// number still look like a <subject> average?" A large divergence means
// something broke — a units change, an answer swap, a methodology rewrite —
// and the feed stops rather than publishing a number we cannot corroborate.
// A canary that cannot be computed at all (thin polling, a failed fetch) does
// NOT block publication; the publisher logs that the value went out
// unchecked, which is the honest reading of "no opinion".
//
// The window / floor / max-window rules (`PollWindowRules`) exist to stop the
// canary going haywire during a polling drought and raising a false alarm
// against a perfectly good published value. Their numbers are per feed: the
// Trump values were set from 560 days of observed poll density and are
// documented on `trump-approval.ts`; the newer feeds start from the same
// numbers and are adjusted per spec in `backend/shared/src/votehub-feeds.ts`.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Calendar dates are compared and shifted as UTC midnights, never as local
 * instants. Both operations then have no DST to be wrong about, and because
 * every date is zero-padded ISO, string ordering is already chronological
 * ordering — so membership tests need no parsing at all.
 */
export const parseDay = (date: string): number | null => {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  // Date.parse is lenient about impossible calendar dates: '2026-02-31'
  // silently rolls forward to March 3 rather than returning NaN. Round-trip
  // the result so a provider typo is rejected instead of being quietly
  // reinterpreted as a different day at the window boundary.
  return new Date(ms).toISOString().slice(0, 10) === date ? ms : null
}

export const shiftDay = (date: string, days: number): string | null => {
  const ms = parseDay(date)
  if (ms == null) return null
  const shifted = ms + days * DAY_MS
  if (!Number.isFinite(shifted)) return null
  return new Date(shifted).toISOString().slice(0, 10)
}

/**
 * The provider timestamp an oracle point carries for a VoteHub value: the UTC
 * midnight of the day VoteHub stamped it. Stored as `source_ts` so the
 * publisher can refuse to roll the mark back to an earlier day's value when
 * the series temporarily regresses (a day dropping out of the response and
 * reappearing later) while still allowing same-day corrections.
 */
export const voteHubDaySourceTs = (day: string): number | null => parseDay(day)

export const daysBetween = (from: string, to: string): number | null => {
  const a = parseDay(from)
  const b = parseDay(to)
  if (a == null || b == null) return null
  return Math.round((b - a) / DAY_MS)
}

export type AveragePoll = {
  /**
   * Last day of fielding (YYYY-MM-DD) — the poll's representative date. Not
   * the publication date: when a poll becomes visible says something about
   * the pollster's release schedule, not about when opinion was measured.
   */
  endDate: string
  /** The tracked answer's percentage, on a 0-100 scale. */
  pct: number
  /** Attribution and display only. Never affects selection or weighting. */
  pollster?: string
}

export type PollWindow = {
  /** The selected polls, newest end_date first. */
  polls: AveragePoll[]
  /** Inclusive earliest end_date admitted (YYYY-MM-DD). */
  startDate: string
  /** Inclusive latest end_date admitted — the valuation day (YYYY-MM-DD). */
  endDate: string
  /** Whole days spanned, inclusive of both ends. */
  spanDays: number
  /** Whether the count floor widened the window past the base window. */
  extended: boolean
}

export type PollWindowResult =
  | { ok: true; window: PollWindow }
  | { ok: false; reason: string }

export type PollAveragePointResult =
  | { ok: true; price: number; window: PollWindow }
  | { ok: false; reason: string }

/**
 * A poll is usable if it reports a percentage that could be a percentage.
 *
 * The provider response is cast rather than schema-validated, so a data-entry
 * error arrives as an ordinary number. One pct of 460 against ~20 polls near
 * 40 moves the mean by ~20 points, which lands inside a feed's plausibility
 * bounds and would price live positions.
 */
export const isUsablePoll = (poll: AveragePoll): boolean =>
  poll != null &&
  parseDay(poll.endDate) != null &&
  typeof poll.pct === 'number' &&
  Number.isFinite(poll.pct) &&
  poll.pct >= 0 &&
  poll.pct <= 100

/**
 * One day of a VoteHub published-average series: an object keyed by answer
 * (`approve`, `disapprove`, `dem`, `rep`, `favorable`, `unfavorable`, ...),
 * each carrying that answer's time-weighted `average`.
 *
 * Typed loosely on purpose: this is an external payload, so every field is
 * treated as absent-or-wrong until checked rather than trusted through a
 * cast.
 */
export type PublishedAverageEntry = Record<
  string,
  { average?: number } | null | undefined
>

/** VoteHub's published average series, keyed by ISO day. */
export type PublishedAverageSeries = Record<
  string,
  PublishedAverageEntry | null | undefined
>

export type PublishedAverageResult =
  | { ok: true; price: number; asOfDay: string; ageDays: number }
  | { ok: false; reason: string }

/**
 * The usable average under `answerKey` for one day, or null.
 *
 * A percentage of exactly 0 or 100 is not a real polling average; it is the
 * shape a cleared or defaulted field takes. Rejecting it here also keeps a
 * literal 0 — which validateBasicOraclePoint would refuse anyway — from ever
 * reaching the price path.
 */
export const readPublishedAverageValue = (
  entry: PublishedAverageEntry | null | undefined,
  answerKey: string
): number | null => {
  if (entry == null || typeof entry !== 'object') return null
  const average = entry[answerKey]?.average
  if (
    typeof average !== 'number' ||
    !Number.isFinite(average) ||
    average <= 0 ||
    average >= 100
  )
    return null
  return average
}

/**
 * Read the most recent published average at or before `day`.
 *
 * Takes the latest available entry rather than requiring one stamped `day`,
 * because the provider posts a same-day value at an hour we do not control and
 * a missing entry early in the morning is routine, not a fault. Age is then
 * checked explicitly — see `maxSourceAgeDays` — so "slightly behind" and
 * "stopped updating" get different answers.
 */
export const readPublishedAverage = (
  series: PublishedAverageSeries | null | undefined,
  day: string,
  options: { answerKey: string; maxAgeDays: number }
): PublishedAverageResult => {
  const { answerKey, maxAgeDays } = options

  if (parseDay(day) == null)
    return { ok: false, reason: `invalid valuation day ${day}` }
  if (typeof answerKey !== 'string' || answerKey.length === 0)
    return { ok: false, reason: `invalid answer key ${answerKey}` }
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0)
    return { ok: false, reason: `invalid maxAgeDays ${maxAgeDays}` }
  if (series == null || typeof series !== 'object')
    return { ok: false, reason: 'published average series is missing' }

  let best: { asOfDay: string; price: number } | null = null
  for (const [key, entry] of Object.entries(series)) {
    if (parseDay(key) == null || key > day) continue
    const average = readPublishedAverageValue(entry, answerKey)
    if (average == null) continue
    if (!best || key > best.asOfDay) best = { asOfDay: key, price: average }
  }

  if (!best)
    return {
      ok: false,
      reason: `no usable published \`${answerKey}\` average on or before ${day}`,
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
 * Shares its validity rules with readPublishedAverage so a backfill and the
 * live job cannot disagree about which entries are real.
 */
export const readPublishedSeries = (
  series: PublishedAverageSeries | null | undefined,
  options: { answerKey: string }
): { day: string; price: number }[] => {
  const { answerKey } = options
  if (series == null || typeof series !== 'object') return []
  if (typeof answerKey !== 'string' || answerKey.length === 0) return []
  return Object.entries(series)
    .flatMap(([key, entry]) => {
      if (parseDay(key) == null) return []
      const average = readPublishedAverageValue(entry, answerKey)
      if (average == null) return []
      return [{ day: key, price: average }]
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/**
 * Absolute distance between the published average and our own computation,
 * or null when either side is unusable — which is "no opinion", not "agrees".
 */
export const getCrossCheckGap = (
  published: number,
  reference: number
): number | null => {
  if (!Number.isFinite(published) || !Number.isFinite(reference)) return null
  const gap = Math.abs(published - reference)
  return Number.isFinite(gap) ? gap : null
}

/** One row of a provider's answer array, before any validation. */
export type PollAnswer = { choice: string; pct: number }

/**
 * Find the answer row for `choice`. Case-insensitive, as the original Trump
 * reader was for "Approve": VoteHub's casing is stable in practice but it is
 * not a contract, and the alternative — a silent empty canary — is worse
 * than admitting `APPROVE`.
 */
const findAnswer = (
  answers: readonly PollAnswer[] | undefined,
  choice: string
) =>
  Array.isArray(answers) && typeof choice === 'string'
    ? answers.find(
        (answer) =>
          typeof answer?.choice === 'string' &&
          answer.choice.toLowerCase() === choice.toLowerCase()
      )
    : undefined

/**
 * Whether the provider offered a row for `choice` at all.
 *
 * Separate from reading it, so a caller can tell "this poll asks a different
 * question" (ordinary, silent) from "this poll answers our question with a
 * number that cannot be a percentage" (a data error worth alerting on).
 */
export const hasAnswer = (
  answers: readonly PollAnswer[] | undefined,
  choice: string
): boolean => findAnswer(answers, choice) != null

/**
 * Read the percentage for `choice`, or null when it is absent or unusable.
 *
 * Lives here rather than in the backend adapter because it is the point where
 * provider data becomes oracle input, and the repo has no test runner under
 * backend/shared to pin that behaviour.
 */
export const readAnswerPct = (
  answers: readonly PollAnswer[] | undefined,
  choice: string
): number | null => {
  const answer = findAnswer(answers, choice)
  if (!answer || typeof answer.pct !== 'number') return null
  if (!Number.isFinite(answer.pct) || answer.pct < 0 || answer.pct > 100)
    return null
  return answer.pct
}

/** How the canary chooses the polls that price a day. */
export type PollWindowRules = {
  /** Trailing window, in whole days, that the canary averages over. */
  windowDays: number
  /** Minimum polls the window must contain before it may be only windowDays wide. */
  minPolls: number
  /** Hard cap on how far the window may reach back to satisfy the floor. */
  maxWindowDays: number
}

/** Everything a VoteHub feed needs beyond its identity. */
export type VoteHubAverageRules = PollWindowRules & {
  /** How stale VoteHub's own latest datapoint may be before we stop publishing. */
  maxSourceAgeDays: number
  /** How far the canary may sit from the published value before we refuse. */
  maxCrossCheckGap: number
  /** Re-stamp an unchanged value after this long (see daily-feed-publish). */
  heartbeatMs: number
}

/**
 * Choose the polls that price `day`.
 *
 * The base window is the `windowDays` days ending on `day`. If that holds at
 * least `minPolls` polls it is used unchanged. Otherwise the window widens to
 * the end_date of the Nth most recent poll.
 *
 * That cut is taken by DATE and is tie-inclusive: every poll sharing the
 * cut-off end_date is admitted, so the result never depends on the input
 * order. Picking "the first N after sorting" would let two polls that ended
 * the same day be separated by nothing but array position — the same
 * order-dependence normalizeOraclePointBatch refuses to tolerate when
 * publishing points, and it matters more here because a tie at the boundary
 * is the common case (five Trump polls ended 2026-07-27).
 *
 * Because the widened cut is defined by rank rather than by age, it does not
 * move as `day` advances. A drought therefore reselects exactly the same
 * polls tomorrow, and the canary does not move until a poll actually arrives.
 */
export const selectPollWindow = (
  polls: readonly AveragePoll[],
  day: string,
  rules: PollWindowRules
): PollWindowResult => {
  const { windowDays, minPolls, maxWindowDays } = rules

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
    .filter((poll) => isUsablePoll(poll) && poll.endDate <= day)
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

/** Unweighted mean of the tracked pct. Null rather than NaN on an empty set. */
export const averagePollPct = (
  polls: readonly AveragePoll[]
): number | null => {
  const usable = polls.filter(isUsablePoll)
  if (usable.length === 0) return null
  const mean = usable.reduce((sum, poll) => sum + poll.pct, 0) / usable.length
  return Number.isFinite(mean) ? mean : null
}

/** Select the window for `day` and average it — the canary value. */
export const computePollAveragePoint = (
  polls: readonly AveragePoll[],
  day: string,
  rules: PollWindowRules
): PollAveragePointResult => {
  const selection = selectPollWindow(polls, day, rules)
  if (!selection.ok) return selection

  const price = averagePollPct(selection.window.polls)
  if (price == null)
    return { ok: false, reason: `could not average the window for ${day}` }

  return { ok: true, price, window: selection.window }
}
