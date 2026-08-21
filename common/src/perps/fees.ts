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
import { getPositionValue, PerpState } from './amm'

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
/** Upper bound for the API-channel base rate: 300 bps = 3% per open. Wider
 * than the web cap on purpose — it exists to price hostile flow: the
 * 2026-08-19/20 BTC drain (M$254k/24h, 100% API-key trades) measured bot
 * captures of 22–30 bps of notional per round trip on average and ~140 bps
 * on the largest momentum entries, so the ceiling must clear the worst
 * observed capture with room to spare. */
export const PERP_TAKER_FEE_API_BPS_MAX = 300

const isValidTakerFeeBps = (bps: number) =>
  Number.isFinite(bps) && bps >= 0 && bps <= PERP_TAKER_FEE_BPS_MAX

const isValidTakerFeeImpact = (impact: number) =>
  Number.isFinite(impact) && impact >= 0 && impact <= PERP_TAKER_FEE_IMPACT_MAX
const isValidTakerFeeApiBps = (bps: number) =>
  Number.isFinite(bps) && bps >= 0 && bps <= PERP_TAKER_FEE_API_BPS_MAX

/**
 * Fail-closed guard for the engine, mirroring assertPerpFundingConfig: new
 * contracts are schema-validated, but old rows bypass that schema, and a
 * corrupt fee must block trading rather than silently repricing it.
 * `undefined` is the valid pre-fee-contract case (reads as the default).
 *
 * `isApi` scopes the API-rate check to the channel that rate governs. A
 * corrupt `takerFeeApiBps` must fail closed for API flow — falling back to
 * the base would silently UNDER-charge exactly the flow the rate exists to
 * price — but it must not halt web opens, which that field never touches.
 * Without the scope, one bad JSON value in an API-only field takes the whole
 * market dark for everyone.
 */
export const assertPerpTakerFeeConfig = (
  config: {
    takerFeeBps?: number
    takerFeeImpact?: number
    takerFeeApiBps?: number
  },
  isApi = false
) => {
  const { takerFeeBps, takerFeeImpact, takerFeeApiBps } = config
  if (takerFeeBps !== undefined && !isValidTakerFeeBps(takerFeeBps))
    throw new Error(
      `taker fee must be finite and in [0, ${PERP_TAKER_FEE_BPS_MAX}] bps`
    )
  if (takerFeeImpact !== undefined && !isValidTakerFeeImpact(takerFeeImpact))
    throw new Error(
      `taker fee size impact must be finite and in [0, ${PERP_TAKER_FEE_IMPACT_MAX}]`
    )
  if (
    isApi &&
    takerFeeApiBps !== undefined &&
    !isValidTakerFeeApiBps(takerFeeApiBps)
  )
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
  // True when the size fee SHOULD apply (impact > 0, notional added) but the
  // net depth is exhausted — the trader's own contribution meets or exceeds
  // the valid gross pool — so the returned fee is base-only and UNDERPRICED.
  // Reachable when a side pool is drained below its holders' aggregate cost
  // basis (the margin-cover incident pattern), where the OI cap can still
  // show headroom. Chargers must fail closed on it; previews must block.
  depthExhausted: boolean
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
  return { fee, effectiveBps, sizeBps, poolShareAfter, depthExhausted: false }
}

/**
 * The one fee-input assembly for an exposure increase — the engine charges
 * from it and the bet panel previews from it, so the state selection can
 * never drift between them.
 *
 * The depth the size term prices against is the pool NET OF the trader's own
 * standing contribution: the mana of theirs that is still IN the pool, which
 * is `min(costBasis, positionValue)` plus the fees they have already paid.
 * Two reasons:
 *
 *  1. Splitting-proofness for real: the pool banks each add's margin and fee,
 *     so pricing against the gross pool let sequential adds ride a depth the
 *     trader deepened themselves — chopping one pool-sized 1× entry into
 *     chunks cut its size fee ~75%. Netting out the trader's own contribution
 *     makes the depth invariant across their own adds, so the integral
 *     telescopes exactly and one open costs the same as any partition of it.
 *
 *  2. It prices the right risk: the trader's own money is not liquidity
 *     available to back the position being priced. It leaves with them at
 *     close (closing is free), so counting it as depth would let a trader
 *     buy a cheaper fee simply by already being large.
 *     (Careful with the mechanics here — `closePosition` pays a LOSING
 *     position's whole payout, and a winning one's principal, out of its
 *     OWN side's pool; only the profit leg is drawn from the opposing pool.
 *     So the gross `L + S` really is the escrow this claim sits against,
 *     which is why the denominator is gross-minus-own rather than the
 *     opposing pool alone.)
 *
 * ⚠️ The netted amount is `min(existingCostBasis, existingPositionValue)`,
 * NOT the raw cost basis, because what belongs in the deduction is the
 * trader's CLAIM on the pool, not the history of what they posted.
 * `costBasis` is the margin they put in and is never marked to market;
 * `min(costBasis, positionValue)` is what a close would actually hand back
 * right now, and is the same expression `calculateAvailableCover` and
 * `applyADL` already use for a holder's claim — so the fee now agrees with
 * the solvency math instead of contradicting it.
 *
 * The motivating failure: once a counterparty CLOSES at a profit,
 * `closePosition` debits the loser's pool by that profit, so `grossPoolDepth`
 * falls while `costBasis` does not. Netting the raw basis then deducts mana
 * that really has left the pool, and the fee is quadratic in 1/depth, so the
 * error squares. Measured before this change: a 1× long 40% underwater on a
 * market whose counterparty had realized paid 951× what a fresh account paid
 * for the identical added notional (M$19,488.68 vs M$20.49 at impact 90;
 * 109× at impact 10) — 97.4% of its own margin, charged rather than
 * rejected. A ~30% larger add crossed the fee<margin reject outright.
 *
 * ⚠️ CALIBRATION CONSEQUENCE, deliberate but worth knowing. A MARK MOVE
 * moves no mana — only closes, factor-0 ADL and resolution do — so
 * `min(costBasis, positionValue)` is an upper bound on what has left the
 * pool, tight only after a counterparty has actually realized. An UNREALIZED
 * drawdown therefore releases part of the deduction while every mana is
 * still sitting in the pool: two holders identical in pools, posted margin,
 * notional and mark, differing only in entry price, pay different fees — at
 * base 10 / impact 90, gross 500,400, a 200,000 position adding 20,000 pays
 * M$74.96 when 40% underwater vs M$108.15 when flat (−30.7%; −35.6% on a
 * 400,000 add). That is the price of pricing the claim rather than the
 * history, and it is bounded by the trader's own posted margin. It cuts fee
 * revenue and size deterrence for low-leverage holders adding into a
 * drawdown; it does not affect solvency, and the levered tick-snipers the
 * fee targets liquidate long before it matters. Revisit at the pre-enable
 * calibration step if that trade-off is not wanted.
 *
 * Two halves of that expression, both load-bearing:
 *
 *  - The FLOOR at position value releases margin that has already been paid
 *    out to winners, so a losing holder is not charged for mana that is gone.
 *  - The CAP at cost basis keeps the deduction to what the trader actually
 *    put in. Unrealized profit is not a contribution — it is a claim payable
 *    from the OPPOSING pool — so letting `value > costBasis` enlarge the
 *    deduction would shrink the depth and overcharge a winning holder for
 *    money they never posted.
 *
 * The taker-fee basis stays OUTSIDE the min, uncapped: those fees were paid
 * in cash and are not part of the position's mark. Folding them inside would
 * let a sequence of adds shrink its own deduction as the position drifts,
 * breaking the splitting-proofness the netting exists to guarantee.
 *
 * The cap does not disturb the splitting-proof telescoping. At a fixed mark
 * an add of margin `m` raises costBasis by `m` and positionValue by `m` too
 * (the new tranche opens at the mark, so it carries π = 0 and the merged
 * entry price conserves the old π), which means `costBasis − positionValue`
 * is CONSTANT across the trader's own adds. `min(costBasis, positionValue)`
 * therefore grows by exactly `m` whichever side of the min is active, the
 * pool grows by `m` + fee, and the depth is invariant — the same reason the
 * raw basis telescoped. Only when the mark MOVES do the two diverge, and
 * that is a genuine change in how much of the trader's money is still in the
 * pool. (`positionValue === costBasis` is the special case π = 0, not the
 * general rule: an underwater holder telescopes just as exactly, with the
 * difference pinned at its drawdown.)
 *
 * When the trader's contribution meets or exceeds a VALID gross pool, the
 * size fee has no denominator and cannot be priced — the returned fee is
 * base-only and `depthExhausted` is set. That state is reachable (a side
 * pool drained below its holders' aggregate STANDING claim while the
 * opposing pool still gives the OI cap headroom), so it must NOT trade at
 * base: the engine fails closed on the flag and the panel blocks submit.
 * With the mark-to-market cap it now fires only when the pool genuinely
 * cannot cover the holder, rather than whenever the holder's historical
 * margin happened to exceed a drawn-down pool.
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
  // getPositionValue(position, price) of that same standing position, at the
  // SAME mark the trade executes against (the engine reads it inside the
  // locked transaction). 0 for a fresh open or the new leg of a flip.
  existingPositionValue: number
  existingTakerFeeCostBasis: number
  addedNotional: number
  baseBps: number
  impact: number
}): PerpSizeFeeDetails => {
  const {
    grossPoolDepth,
    existingSize,
    existingCostBasis,
    existingPositionValue,
    existingTakerFeeCostBasis,
    addedNotional,
    baseBps,
    impact,
  } = args
  const gross =
    Number.isFinite(grossPoolDepth) && grossPoolDepth > 0 ? grossPoolDepth : 0
  const costBasis =
    Number.isFinite(existingCostBasis) && existingCostBasis > 0
      ? existingCostBasis
      : 0
  // A value we cannot trust must never buy a DISCOUNT. Falling back to 0
  // would make a corrupt or omitted mark the cheapest input there is; falling
  // back to the full cost basis reproduces the old, strictly higher-fee
  // behaviour instead. The engine separately refuses to price a position
  // whose mark cannot be computed (see openOrAddPosition), so this fallback
  // is the display path's floor, not a trading path.
  const standingValue =
    Number.isFinite(existingPositionValue) && existingPositionValue >= 0
      ? existingPositionValue
      : costBasis
  const ownContribution =
    Math.min(costBasis, standingValue) +
    (Number.isFinite(existingTakerFeeCostBasis) && existingTakerFeeCostBasis > 0
      ? existingTakerFeeCostBasis
      : 0)
  const poolDepth = Math.max(gross - ownContribution, 0)
  const notionalBefore =
    Number.isFinite(existingSize) && existingSize > 0 ? existingSize : 0
  const details = perpSizeFeeDetails({
    notionalBefore,
    notionalAfter: notionalBefore + addedNotional,
    poolDepth,
    baseBps,
    impact,
  })
  const impactApplies = Number.isFinite(impact) && impact > 0
  const notionalAdded = Number.isFinite(addedNotional) && addedNotional > 0
  return {
    ...details,
    // Only a VALID gross pool that the trader's own contribution exhausts
    // counts as exhausted — a degenerate gross (corrupt display data) stays
    // base-only without the flag, since the engine separately asserts pool
    // sanity via the escrow check before any mana moves.
    depthExhausted:
      impactApplies && notionalAdded && gross > 0 && poolDepth <= 0,
  }
}

/** Fee slippage a caller accepts between previewing a trade and it executing,
 * in BPS OF THE TRADE'S NOTIONAL — the unit a trader already thinks in for
 * slippage, and the unit the rejection message speaks.
 *
 * Sized as a fraction of NOTIONAL rather than as a percentage of the fee on
 * purpose. The impact term goes as 1/depth², so a percentage-of-fee band
 * tightens exactly as the fee grows: the previous "fee × 1.01" bound rejected
 * a M$1M BTC entry once only M$1,974 (0.52% of the pool) had left, and got
 * stricter the larger the trade. A bps-of-size band is scale-invariant — the
 * same M$1M entry now tolerates M$62k of outflow at impact 10 — and it is a
 * number a trader can reason about, because it is directly comparable to the
 * fee itself. */
export const PERP_FEE_SLIPPAGE_BPS = 10

/**
 * The `maxFee` a client should send alongside a previewed fee.
 *
 * A ZERO preview still authorises exactly zero: "free" has to mean free, so a
 * client whose config is stale (impact was just enabled) cannot silently
 * consent to a fee it never showed. Slippage room is only granted once the
 * trader has accepted a nonzero number.
 */
export const perpMaxFeeFor = (previewedFee: number, notional: number) => {
  if (!Number.isFinite(previewedFee) || previewedFee <= 0) return 0
  const tolerance =
    Number.isFinite(notional) && notional > 0
      ? (notional * PERP_FEE_SLIPPAGE_BPS) / 10_000
      : 0
  const max = Math.ceil((previewedFee + tolerance) * 100) / 100
  return Number.isFinite(max) && max > 0 ? max : 0
}

/**
 * The own-contribution half of `perpOpenFeeQuote`'s inputs, derived from the
 * trader's standing SAME-direction position at the trade's mark.
 *
 * Extracted because both fee-charging callers — the engine inside its locked
 * transaction and the bet panel's preview — have to derive these four fields
 * identically, and deriving them twice is how the two drift. In particular
 * `existingPositionValue` must be `getPositionValue(position, price)` and not
 * `position.costBasis`: the whole point of the netting is that the deduction
 * tracks the trader's current claim on the pool rather than the margin they
 * once posted. That single substitution is a ~24x mispricing on a drawn-down
 * book and it type-checks, so it lives here where a test can pin it.
 *
 * `undefined` (a fresh open, or a flip's newly opened leg) yields all zeros:
 * a flip's closed leg has already left `grossPoolDepth` via its payout, so it
 * must not also be subtracted here.
 */
export const perpOwnContributionInputs = (
  standingSame: PerpPosition | undefined,
  price: number
) => ({
  existingSize: standingSame?.size ?? 0,
  existingCostBasis: standingSame?.costBasis ?? 0,
  existingPositionValue: standingSame
    ? getPositionValue(standingSame, price)
    : 0,
  existingTakerFeeCostBasis: standingSame?.takerFeeCostBasis ?? 0,
})

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
