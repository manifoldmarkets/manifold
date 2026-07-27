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
 * Should a funding event fire now? Two conditions, both load-bearing:
 *
 * 1. Period elapsed, minus one minute of slack. The slack is not slop: cron
 *    fires at :00 sharp, so a run often starts a few hundred ms EARLIER in
 *    the second than the previous event's commit stamp — a full-period
 *    comparison silently skips those periods (observed live: 16:00:01.104
 *    event, 17:00:00.822 run, elapsed 3,599,780ms, no funding written). The
 *    slack is absolute (scheduler jitter), not proportional, so it stays
 *    MINUTE_MS at a 24h period.
 *
 * 2. The oracle produced a new price since the last funding event. Funding
 *    must coincide with price movement: a free-running timer on a daily feed
 *    drifts off the daily tick and eventually fires on an iteration where no
 *    new price was applied — reopening the open-just-before-the-tick dodge
 *    that per-contract periods exist to close. For fast feeds a new price
 *    lands almost every iteration, so the period gate does all the work —
 *    one rule, not a special case. Consequence: a dead feed means no funding
 *    (no movement, no carry); the stale-feed alerting in update-perps covers
 *    detection.
 *
 * The oracle comparison also gets MINUTE_MS of slack: data timestamps lag
 * wall clocks (a NESO settlement block ending 17:00:00.000 is newer data
 * than a funding event stamped 17:00:00.822), and without slack a feed
 * running >30min late skips alternate hours — the same flake shape the
 * period slack exists to prevent.
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
  /** ts of the newest oracle price known to the caller. */
  latestOracleTime: number | undefined
  fundingPeriodMs: number
}): boolean => {
  const { now, lastFundingTime, latestOracleTime, fundingPeriodMs } = args
  // Fail closed on garbage — a NaN comparison would silently never fund
  // (or always fund) depending on which branch it poisons.
  if (!Number.isFinite(now)) return false
  if (!Number.isFinite(fundingPeriodMs) || fundingPeriodMs < HOUR_MS)
    return false
  if (!lastFundingTime) return true
  if (now - lastFundingTime < fundingPeriodMs - MINUTE_MS) return false
  return (latestOracleTime ?? 0) > lastFundingTime - MINUTE_MS
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
