/**
 * Gate check. Before any scenario output is worth reading, the sandbox has to
 * reproduce numbers prod actually committed.
 *
 * Replays all 63 stored funding events for the BTC perp: feed each event's
 * recorded pre-transfer POOL balances into the imported `computeFundingRate`
 * and compare with the `funding_rate` prod wrote for that event.
 *
 * Two passes, because the contract was re-configured mid-window:
 *   - "current config": every event at today's k / f_max. Events after the
 *     08-07T18:00 change reproduce exactly; earlier ones do not, by a clean
 *     constant factor.
 *   - "recovered history": each event at the config in force AT THE TIME (see
 *     paramHistory in the data file). All 63 must reproduce exactly.
 *
 * Passing proves (a) the sandbox is running prod's own funding function, and
 * (b) the funding prod is charging today is POOL-derived, not OI-derived.
 */

import { computeFundingRate, getPerpOpenInterest } from './common'
import {
  loadFundingEvents,
  loadSnapshot,
  paramsAt,
  snapshotToState,
} from './book'
import { fundingRateFor } from './model'

export type ValidationRow = {
  ts: string
  poolLong: number
  poolShort: number
  stored: number
  /** At today's contract config. */
  atCurrentConfig: number
  relErrorCurrent: number
  /** At the config in force when the event fired. */
  atHistoricConfig: number
  relErrorHistoric: number
  fMaxUsed: number
  kUsed: number
}

export type ValidationReport = {
  rows: ValidationRow[]
  maxRelErrorCurrent: number
  maxRelErrorHistoric: number
  worstHistoric: ValidationRow
  matchingAtCurrentConfig: number
  passed: boolean
  configChange: { at: string; from: number; to: number } | null
  live: {
    storedRate: number
    poolDerived: number
    oiDerived: number
    poolMatchesStored: boolean
    oiMatchesStored: boolean
    poolLong: number
    poolShort: number
    oiLong: number
    oiShort: number
  }
}

/** Tight but not exact-equality: stored values are float8 round-trips. */
const REL_TOLERANCE = 1e-9

export const validate = (): ValidationReport => {
  const log = loadFundingEvents()
  const k = log.fundingSensitivity
  const fMax = log.maxFundingRate

  const rows: ValidationRow[] = log.events.map(
    ([ts, poolLong, poolShort, stored]) => {
      const era = paramsAt(log, ts)
      const atCurrentConfig = computeFundingRate(poolLong, poolShort, k, fMax)
      const atHistoricConfig = computeFundingRate(
        poolLong,
        poolShort,
        era.fundingSensitivity,
        era.maxFundingRate
      )
      const rel = (v: number) =>
        stored !== 0 ? Math.abs(v - stored) / Math.abs(stored) : Math.abs(v)
      return {
        ts,
        poolLong,
        poolShort,
        stored,
        atCurrentConfig,
        relErrorCurrent: rel(atCurrentConfig),
        atHistoricConfig,
        relErrorHistoric: rel(atHistoricConfig),
        fMaxUsed: era.maxFundingRate,
        kUsed: era.fundingSensitivity,
      }
    }
  )

  const worstHistoric = rows.reduce(
    (a, b) => (b.relErrorHistoric > a.relErrorHistoric ? b : a),
    rows[0]
  )
  const maxRelErrorCurrent = Math.max(...rows.map((r) => r.relErrorCurrent))
  const maxRelErrorHistoric = Math.max(...rows.map((r) => r.relErrorHistoric))

  // Where the config moved, per the recovered history.
  let configChange: ValidationReport['configChange'] = null
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].fMaxUsed !== rows[i - 1].fMaxUsed) {
      configChange = {
        at: rows[i].ts,
        from: rows[i - 1].fMaxUsed,
        to: rows[i].fMaxUsed,
      }
    }
  }

  // The contract's own denormalised copy, against the book as it stands now.
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const oi = getPerpOpenInterest(state.positions)
  const base = {
    k: snap.fundingSensitivity,
    fMax: snap.maxFundingRate,
    exponent: 1,
  }
  const poolDerived = fundingRateFor(state, { ...base, imbalanceInput: 'pool' })
  const oiDerived = fundingRateFor(state, {
    ...base,
    imbalanceInput: 'openInterest',
  })
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= Math.max(Math.abs(b), 1e-30) * 1e-9

  return {
    rows,
    maxRelErrorCurrent,
    maxRelErrorHistoric,
    worstHistoric,
    matchingAtCurrentConfig: rows.filter(
      (r) => r.relErrorCurrent <= REL_TOLERANCE
    ).length,
    passed: maxRelErrorHistoric <= REL_TOLERANCE,
    configChange,
    live: {
      storedRate: snap.storedFundingRate,
      poolDerived,
      oiDerived,
      poolMatchesStored: near(poolDerived, snap.storedFundingRate),
      oiMatchesStored: near(oiDerived, snap.storedFundingRate),
      poolLong: snap.poolLong,
      poolShort: snap.poolShort,
      oiLong: oi.long,
      oiShort: oi.short,
    },
  }
}
