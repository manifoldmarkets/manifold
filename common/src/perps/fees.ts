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

/** Upper bound for admin configuration: 100 bps = 1% per open. This caps the
 * BASE rate only — the size-dependent total (see calcPerpSizeFee) is
 * intentionally uncapped, so pool-sized entries pay more than 100 bps. */
export const PERP_TAKER_FEE_BPS_MAX = 100

/** Default size-impact coefficient for the size-dependent fee (deliberately
 * NOT named `k` — the ManiPerp paper already uses k for fundingSensitivity).
 * Shipped at 0 so a deploy changes nothing (the fee stays exactly the flat
 * base); enabled per-contract via update-perp-config once a market is
 * watched live. Launch operating value: 10 (chosen 2026-08-20 so a
 * 4×-pool-size entry pays ~0.6% effective; deterrence of pool-scale
 * informed flow leans on the fee<margin reject, the OI cap, and leverage
 * caps rather than this dial alone). */
export const PERP_TAKER_FEE_IMPACT_DEFAULT = 0

/** Sanity bound for admin configuration of the impact coefficient — 10× the
 * launch operating value of 10, so a fat-fingered config stays survivable
 * (at 100, even a 4×-pool entry pays ~5.4% effective, and the engine's
 * fee<margin reject bounds the per-trade damage regardless). A bound on the
 * CONFIG knob, not on the resulting fee. */
export const PERP_TAKER_FEE_IMPACT_MAX = 100

const isValidTakerFeeBps = (bps: number) =>
  Number.isFinite(bps) && bps >= 0 && bps <= PERP_TAKER_FEE_BPS_MAX

const isValidTakerFeeImpact = (impact: number) =>
  Number.isFinite(impact) && impact >= 0 && impact <= PERP_TAKER_FEE_IMPACT_MAX

/**
 * Fail-closed guard for the engine, mirroring assertPerpFundingConfig: new
 * contracts are schema-validated, but old rows bypass that schema, and a
 * corrupt fee must block trading rather than silently repricing it.
 * `undefined` is the valid pre-fee-contract case (reads as the default).
 */
export const assertPerpTakerFeeConfig = (config: {
  takerFeeBps?: number
  takerFeeImpact?: number
}) => {
  const { takerFeeBps, takerFeeImpact } = config
  if (takerFeeBps !== undefined && !isValidTakerFeeBps(takerFeeBps))
    throw new Error(
      `taker fee must be finite and in [0, ${PERP_TAKER_FEE_BPS_MAX}] bps`
    )
  if (takerFeeImpact !== undefined && !isValidTakerFeeImpact(takerFeeImpact))
    throw new Error(
      `taker fee size impact must be finite and in [0, ${PERP_TAKER_FEE_IMPACT_MAX}]`
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

/** Fee in mana on a notional amount. Returns 0 for any degenerate input. */
export const calcPerpTakerFee = (notional: number, feeBps: number): number => {
  if (!Number.isFinite(notional) || notional <= 0) return 0
  if (!Number.isFinite(feeBps) || feeBps <= 0) return 0
  const fee = notional * (feeBps / 10_000)
  return Number.isFinite(fee) && fee > 0 ? fee : 0
}

/**
 * Size-impact coefficient for a contract. Total (never throws), like
 * getPerpTakerFeeBps: corrupt legacy data reads as the default; the engine
 * separately rejects invalid config via assertPerpTakerFeeConfig.
 */
export const getPerpTakerFeeImpact = (contract: {
  takerFeeImpact?: number
}): number => {
  const { takerFeeImpact } = contract
  if (takerFeeImpact === undefined) return PERP_TAKER_FEE_IMPACT_DEFAULT
  return isValidTakerFeeImpact(takerFeeImpact)
    ? takerFeeImpact
    : PERP_TAKER_FEE_IMPACT_DEFAULT
}

/**
 * Size-dependent taker fee in mana on an exposure INCREASE (open, add, or the
 * newly-opened leg of a flip): the marginal rate at pool-share s = N/P is
 * `base + impact·s²` bps, charged as its integral over the added notional
 * [N0, N1]:
 *
 *   fee = (1/10_000) · [ base·(N1−N0) + (impact/(3·P²))·(N1³ − N0³) ]
 *
 * The integral form makes the fee splitting-proof per account: chopping one
 * big add into many small sequential adds costs exactly the same, because the
 * integral is path-independent in notional. ⚠️ That holds only if P itself
 * cannot be moved by the trader's own chunks — the pool banks each add's
 * margin and fee, so P must EXCLUDE the trader's own standing contribution
 * (see perpOpenFeeQuote, which every fee-charging and fee-previewing caller
 * goes through). A fresh position of pool-share S = N1/P pays the effective
 * (average) rate `base + (impact/3)·S²` bps — honest sub-10%-of-pool flow
 * pays ~base, pool-sized entries pay multiples of it. The total is
 * intentionally NOT capped at PERP_TAKER_FEE_BPS_MAX; only the base config
 * is.
 *
 * Computed in share space, (impact/3)·P·(s1³ − s0³), which is algebraically
 * identical but keeps intermediates O(pool) instead of O(notional³).
 *
 * Guards (display path is total, mirroring calcPerpTakerFee): returns 0 when
 * nothing is added or any notional is degenerate; a degenerate pool depth
 * charges the base only (no share to measure against); the result is clamped
 * finite ≥ 0.
 */
export const calcPerpSizeFee = (args: {
  notionalBefore: number // N0: existing same-direction notional (0 = fresh)
  notionalAfter: number // N1 = N0 + added notional
  poolDepth: number // P: external pool depth (see perpOpenFeeQuote)
  baseBps: number // flat base rate (today's takerFeeBps)
  impact: number // size-impact coefficient (contract takerFeeImpact)
}): number => {
  const { notionalBefore, notionalAfter, poolDepth, baseBps } = args
  if (!Number.isFinite(notionalBefore) || notionalBefore < 0) return 0
  if (!Number.isFinite(notionalAfter)) return 0
  const added = notionalAfter - notionalBefore
  if (!Number.isFinite(added) || added <= 0) return 0
  // The base term IS the flat fee — delegate so the two can never diverge
  // (the impact = 0 path must stay identical to the pre-impact flat fee).
  const baseFee = calcPerpTakerFee(added, baseBps)
  const impact =
    Number.isFinite(args.impact) && args.impact > 0 ? args.impact : 0
  if (impact <= 0 || !Number.isFinite(poolDepth) || poolDepth <= 0)
    return baseFee
  const shareBefore = notionalBefore / poolDepth
  const shareAfter = notionalAfter / poolDepth
  const impactFee =
    ((impact / 3) * poolDepth * (shareAfter ** 3 - shareBefore ** 3)) / 10_000
  const fee = baseFee + impactFee
  return Number.isFinite(fee) && fee > 0 ? fee : 0
}

export type PerpSizeFeeDetails = {
  fee: number // mana charged on this exposure increase
  effectiveBps: number // fee / added notional × 10_000 (0 when nothing added)
  sizeBps: number // size component: effectiveBps − base, clamped ≥ 0
  poolShareAfter: number // N1 / P (0 when the pool depth is degenerate)
}

/**
 * calcPerpSizeFee plus the derived numbers every consumer of the fee needs to
 * explain it — the engine's event stamp, the bet panel's breakdown, and
 * analytics all read THIS so the arithmetic cannot drift between them.
 */
export const perpSizeFeeDetails = (args: {
  notionalBefore: number
  notionalAfter: number
  poolDepth: number
  baseBps: number
  impact: number
}): PerpSizeFeeDetails => {
  const { notionalBefore, notionalAfter, poolDepth, baseBps } = args
  const fee = calcPerpSizeFee(args)
  const added =
    Number.isFinite(notionalBefore) && Number.isFinite(notionalAfter)
      ? notionalAfter - notionalBefore
      : 0
  const effectiveBps = added > 0 && fee > 0 ? (fee / added) * 10_000 : 0
  // The impact term is ≥ 0, so effective ≥ base whenever a fee was charged;
  // the clamp only absorbs the fee-was-zero cases and float dust.
  const base = Number.isFinite(baseBps) && baseBps > 0 ? baseBps : 0
  const sizeBps = Math.max(0, effectiveBps - base)
  const poolShareAfter =
    Number.isFinite(poolDepth) &&
    poolDepth > 0 &&
    Number.isFinite(notionalAfter) &&
    notionalAfter > 0
      ? notionalAfter / poolDepth
      : 0
  return { fee, effectiveBps, sizeBps, poolShareAfter }
}

/**
 * The one fee-input assembly for an exposure increase — the engine charges
 * from it and the bet panel previews from it, so the state selection can
 * never drift between them.
 *
 * The depth the size term prices against is the pool NET OF the trader's own
 * standing contribution (their same-direction margin plus the fees they have
 * already paid into the pool). Two reasons:
 *
 *  1. Splitting-proofness for real: the pool banks each add's margin and fee,
 *     so pricing against the gross pool let sequential adds ride a depth the
 *     trader deepened themselves — chopping one pool-sized 1× entry into
 *     chunks cut its size fee ~75%. Netting out the trader's own contribution
 *     makes the depth invariant across their own adds, so the integral
 *     telescopes exactly and one open costs the same as any partition of it.
 *
 *  2. It prices the right risk: a long's winnings are paid from the SHORT
 *     pool — the margin a trader posts sits in their own side's pool and
 *     never backs their own claim, so it is not liquidity available to the
 *     position being priced (and it leaves with them at close, closing free).
 *
 * When the trader's contribution exceeds the gross pool (a devastated market
 * that is nominally all their money), depth clamps to 0 and the size term
 * falls back to base-only; the open-interest cap blocks meaningful adds in
 * that state long before the fee matters.
 */
export const perpOpenFeeQuote = (args: {
  // Gross backing pool the trade executes against (getPerpBackingPool of the
  // pre-trade pools — for a flip, AFTER the opposite leg's close is applied,
  // since that payout has already left the pool when the new leg is priced).
  grossPoolDepth: number
  // The trader's standing same-direction position; zeros for a fresh open or
  // the new leg of a flip.
  existingSize: number
  existingCostBasis: number
  existingTakerFeeCostBasis: number
  addedNotional: number
  baseBps: number
  impact: number
}): PerpSizeFeeDetails => {
  const {
    grossPoolDepth,
    existingSize,
    existingCostBasis,
    existingTakerFeeCostBasis,
    addedNotional,
    baseBps,
    impact,
  } = args
  const gross =
    Number.isFinite(grossPoolDepth) && grossPoolDepth > 0 ? grossPoolDepth : 0
  const ownContribution =
    (Number.isFinite(existingCostBasis) && existingCostBasis > 0
      ? existingCostBasis
      : 0) +
    (Number.isFinite(existingTakerFeeCostBasis) && existingTakerFeeCostBasis > 0
      ? existingTakerFeeCostBasis
      : 0)
  const poolDepth = Math.max(gross - ownContribution, 0)
  const notionalBefore =
    Number.isFinite(existingSize) && existingSize > 0 ? existingSize : 0
  return perpSizeFeeDetails({
    notionalBefore,
    notionalAfter: notionalBefore + addedNotional,
    poolDepth,
    baseBps,
    impact,
  })
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
