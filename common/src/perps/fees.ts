// Taker fee for perp trades. Charged on NOTIONAL (size, not margin) when a
// position is OPENED or added to — closing is free — and paid into the
// trader's side backing pool: it is subsidy for the market, not platform
// revenue. Open-only keeps the cost fully visible up front (a fresh position
// starts at PnL = −fee via takerFeeCostBasis) and leaves the close path's
// payout math untouched.
//
// Why this exists: perp trades execute at the cached oracle price, and with
// zero fees that price is a free option for latency bots — watch the live
// source, trade the stale mark just before the tick, exit just after
// (2026-08-07: two bots extracted ~M$70k from the BTC perp pools in ~30h of
// 4-second round trips; measured edge ~1.5 bps of notional per round trip).
// A fee proportional to notional cannot be outgrown by sizing up or levering
// up. Every snipe requires an entry, so an open-only fee taxes each round
// trip exactly once: at the default 10 bps, only oracle moves > 10 bps per
// tick clear a round trip — 7 occurrences in the first 31h of the BTC feed.

import { PerpDirection, PerpPosition } from './position'
import { PerpState } from './amm'

/** Default open-side fee, in basis points of notional. Since closing is
 * free, this IS the round-trip cost. Applies to contracts created before the
 * field existed; new contracts stamp it at create time. */
export const PERP_TAKER_FEE_BPS_DEFAULT = 10

/** Upper bound for admin configuration: 100 bps = 1% per open. */
export const PERP_TAKER_FEE_BPS_MAX = 100

/** Upper bound for the API-channel base rate: 300 bps = 3% per open. Wider
 * than the web cap on purpose — it exists to price hostile flow: the
 * 2026-08-19/20 BTC drain (M$254k/24h, 100% API-key trades) measured bot
 * captures of 22–30 bps of notional per round trip on average and ~140 bps
 * on the largest momentum entries, so the ceiling must clear the worst
 * observed capture with room to spare. */
export const PERP_TAKER_FEE_API_BPS_MAX = 300

const isValidTakerFeeBps = (bps: number) =>
  Number.isFinite(bps) && bps >= 0 && bps <= PERP_TAKER_FEE_BPS_MAX

const isValidTakerFeeApiBps = (bps: number) =>
  Number.isFinite(bps) && bps >= 0 && bps <= PERP_TAKER_FEE_API_BPS_MAX

/**
 * Fail-closed guard for the engine, mirroring assertPerpFundingConfig: new
 * contracts are schema-validated, but old rows bypass that schema, and a
 * corrupt fee must block trading rather than silently repricing it.
 * `undefined` is the valid pre-fee-contract case (reads as the default).
 */
export const assertPerpTakerFeeConfig = (config: {
  takerFeeBps?: number
  takerFeeApiBps?: number
}) => {
  const { takerFeeBps, takerFeeApiBps } = config
  if (takerFeeBps !== undefined && !isValidTakerFeeBps(takerFeeBps))
    throw new Error(
      `taker fee must be finite and in [0, ${PERP_TAKER_FEE_BPS_MAX}] bps`
    )
  if (takerFeeApiBps !== undefined && !isValidTakerFeeApiBps(takerFeeApiBps))
    throw new Error(
      `API taker fee must be finite and in [0, ${PERP_TAKER_FEE_API_BPS_MAX}] bps`
    )
}

/**
 * Effective fee in bps for a contract. Total (never throws) so corrupt legacy
 * data cannot turn a React render into NaN — the engine separately rejects
 * invalid config via assertPerpTakerFeeConfig before any mana moves.
 */
export const getPerpTakerFeeBps = (contract: {
  takerFeeBps?: number
}): number => {
  const { takerFeeBps } = contract
  if (takerFeeBps === undefined) return PERP_TAKER_FEE_BPS_DEFAULT
  return isValidTakerFeeBps(takerFeeBps)
    ? takerFeeBps
    : PERP_TAKER_FEE_BPS_DEFAULT
}

/**
 * The base rate a specific trade pays, selected by auth channel. API-key
 * trades pay `takerFeeApiBps` when it is set — as `max(base, api)`, so a
 * misconfigured API rate below the base can never DISCOUNT bot flow — and
 * the web base otherwise. Missing or invalid `takerFeeApiBps` reads as "no
 * separate API rate" (total, like getPerpTakerFeeBps: render paths must not
 * throw; the engine separately fail-closes via assertPerpTakerFeeConfig).
 *
 * Why per-channel: the 2026-08-19/20 BTC drain was 100% API-key flow, and a
 * flat raise taxes the honest web majority for the bots' edge. The channel
 * check is auth-derived server-side (`auth.creds.kind === 'key'`), never
 * client-supplied — a bot CAN dodge it by scripting a session token, so this
 * is a raised bar and a clean ToS line, not a wall; the structural fix is
 * next-tick execution.
 */
export const getPerpEffectiveTakerFeeBps = (
  contract: { takerFeeBps?: number; takerFeeApiBps?: number },
  isApi: boolean
): number => {
  const base = getPerpTakerFeeBps(contract)
  if (!isApi) return base
  const { takerFeeApiBps } = contract
  if (takerFeeApiBps === undefined || !isValidTakerFeeApiBps(takerFeeApiBps))
    return base
  return Math.max(base, takerFeeApiBps)
}

/** Fee in mana on a notional amount. Returns 0 for any degenerate input. */
export const calcPerpTakerFee = (notional: number, feeBps: number): number => {
  if (!Number.isFinite(notional) || notional <= 0) return 0
  if (!Number.isFinite(feeBps) || feeBps <= 0) return 0
  const fee = notional * (feeBps / 10_000)
  return Number.isFinite(fee) && fee > 0 ? fee : 0
}

/**
 * Credit a collected fee to one side's backing pool. Pure, like the amm.ts
 * transitions: the caller persists the new pool. The fee mana enters
 * contract escrow with the open-margin debit, so ledger = poolLong +
 * poolShort remains a checkable invariant.
 */
export const creditPerpPoolFee = (
  state: PerpState,
  side: PerpDirection,
  fee: number
): PerpState => {
  if (!Number.isFinite(fee) || fee <= 0) return state
  return {
    ...state,
    pool: {
      L: state.pool.L + (side === 'long' ? fee : 0),
      S: state.pool.S + (side === 'short' ? fee : 0),
    },
  }
}

/**
 * Add an opening/add fee to the live position's user-facing cost basis without
 * changing AMM margin, leverage, or liquidation math. Returns a new state and
 * position; the input objects are never mutated.
 */
export const accruePerpPositionTakerFee = (
  state: PerpState,
  position: PerpPosition,
  fee: number
): { state: PerpState; position: PerpPosition } => {
  const existingFeeBasis = position.takerFeeCostBasis ?? 0
  if (!Number.isFinite(existingFeeBasis) || existingFeeBasis < 0)
    throw new Error(
      'position taker fee cost basis must be finite and non-negative'
    )
  if (!Number.isFinite(fee) || fee <= 0) return { state, position }

  const takerFeeCostBasis = existingFeeBasis + fee
  if (!Number.isFinite(takerFeeCostBasis))
    throw new Error('position taker fee cost basis overflowed')

  const nextPosition = { ...position, takerFeeCostBasis }
  const positionIndex = state.positions.findIndex(
    (candidate) =>
      candidate.userId === position.userId &&
      candidate.direction === position.direction
  )
  if (positionIndex < 0)
    throw new Error('position taker fee target is missing from state')
  return {
    state: {
      ...state,
      positions: state.positions.map((candidate, index) =>
        index === positionIndex ? nextPosition : candidate
      ),
    },
    position: nextPosition,
  }
}
