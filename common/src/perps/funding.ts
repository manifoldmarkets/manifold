// Funding cadence: the period between funding events and the gate that
// decides whether an event fires. This module is the single source of truth
// for both — the engine (backend/shared/src/perps/engine.ts), the scheduler
// prefilter (update-perps), and the chart projections all import from here,
// so the two runtime gates cannot drift apart (the drift was a live bug:
// see commit 846752c7d).

import { HOUR_MS, MINUTE_MS } from '../util/time'

/**
 * Default funding period. Contracts created before per-contract periods
 * existed carry no `fundingPeriodMs` and fall back to hourly — the cadence
 * they were trading under all along.
 */
export const FUNDING_PERIOD_MS = HOUR_MS

/**
 * A contract's funding period. Derived from the oracle feed's update cadence
 * at create time (`max(1h, feed.updatePeriodMs)`) and frozen on the contract,
 * so a later change to the feed registry can't rewrite the economics of
 * positions people already hold.
 */
export const getFundingPeriodMs = (contract: {
  fundingPeriodMs?: number
}): number => {
  const p = contract.fundingPeriodMs
  // Sub-hour or garbage values fall back to the default: funding only runs
  // from the hourly scheduler job, so a shorter period is unhonourable and
  // pretending otherwise would make every display number a lie.
  if (p == null || !Number.isFinite(p) || p < HOUR_MS) return FUNDING_PERIOD_MS
  return p
}

/**
 * Should a funding event fire now?
 *
 * 1. The first event requires a complete period from market creation. Later
 *    events allow one minute of scheduler jitter: cron fires at :00 sharp,
 *    so a run often starts a few hundred ms EARLIER in the second than the
 *    previous event's commit stamp. A full-period comparison silently skips
 *    those later events (observed live: 16:00:01.104 event, 17:00:00.822 run,
 *    elapsed 3,599,780ms). The first event has no prior cron commit jitter,
 *    and charging a full period minutes after creation would be unfair.
 *
 * 2. For periods LONGER than the scheduler's hourly funding cadence only:
 *    the oracle produced a new price since the last funding event. The
 *    anchor exists to kill the PREDICTABLE dodge — a free-running 24h timer
 *    drifts off the daily tick until funding fires at a time the price
 *    provably won't move, and sitting flat across it costs nothing. That
 *    dodge only exists when funding can fire more often than the feed
 *    produces values, which the period derivation (max(1h, cadence)) makes
 *    impossible for hourly contracts: every hourly period contains expected
 *    movement, so any skip there would be timestamp minutiae (a NESO block
 *    stamped 17:00:00.000 vs an event stamped 17:00:00.822), not dodge
 *    prevention — unpredictable timing noise is already friction enough.
 *    For slow periods the comparison is strict with no slack: the normal
 *    case has hours of margin, and a value stamped seconds before the last
 *    funding with nothing since really is a feed that produced nothing all
 *    period — no movement, no carry. update-perps' staleness alerting
 *    covers detection.
 *
 * Callers pass their best view of the latest oracle timestamp: the engine
 * passes the contract's applied `oraclePriceTime`; the scheduler prefilter
 * passes the feed's latest row. The prefilter runs after runOracleUpdate,
 * so prefilter-pass implies the engine sees the same or newer.
 */
export const shouldApplyFunding = (args: {
  now: number
  /** ts of the last funding event; undefined/0 = never funded. */
  lastFundingTime: number | undefined
  /** Market creation time; the first full holding period starts here. */
  fundingStartTime: number
  /** ts of the newest oracle price known to the caller. */
  latestOracleTime: number | undefined
  fundingPeriodMs: number
}): boolean => {
  const {
    now,
    lastFundingTime,
    fundingStartTime,
    latestOracleTime,
    fundingPeriodMs,
  } = args
  // Fail closed on garbage — a NaN comparison would silently never fund
  // (or always fund) depending on which branch it poisons.
  if (!Number.isFinite(now)) return false
  if (!Number.isFinite(fundingStartTime) || fundingStartTime <= 0) return false
  if (!Number.isFinite(fundingPeriodMs) || fundingPeriodMs < HOUR_MS)
    return false
  if (
    lastFundingTime != null &&
    lastFundingTime !== 0 &&
    (!Number.isFinite(lastFundingTime) ||
      lastFundingTime < fundingStartTime ||
      lastFundingTime > now)
  )
    return false

  const isFirstFunding = !lastFundingTime
  const anchor = lastFundingTime || fundingStartTime
  const jitterAllowance = isFirstFunding ? 0 : MINUTE_MS
  if (now - anchor < fundingPeriodMs - jitterAllowance) return false
  if (fundingPeriodMs <= HOUR_MS) return true
  return (
    latestOracleTime != null &&
    Number.isFinite(latestOracleTime) &&
    latestOracleTime > anchor
  )
}

/**
 * Short unit label for funding copy: "hr" for hourly, "day" for daily,
 * "4h"-style otherwise. Pair with fundingPeriodNoun for prose.
 */
export const fundingPeriodUnit = (periodMs: number): string => {
  if (periodMs === HOUR_MS) return 'hr'
  if (periodMs === 24 * HOUR_MS) return 'day'
  return `${Math.round(periodMs / HOUR_MS)}h`
}

/** Prose noun: "hour", "day", or "4 hours". */
export const fundingPeriodNoun = (periodMs: number): string => {
  if (periodMs === HOUR_MS) return 'hour'
  if (periodMs === 24 * HOUR_MS) return 'day'
  return `${Math.round(periodMs / HOUR_MS)} hours`
}
