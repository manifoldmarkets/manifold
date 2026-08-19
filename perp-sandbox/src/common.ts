/**
 * THE ONLY BRIDGE TO PRODUCTION MATH.
 *
 * Every formula this sandbox uses is re-exported from `common/src/perps/*` in
 * the real repo. Nothing here computes anything. If prod's math changes, this
 * file breaks (or silently starts returning the new answer, which is the
 * point) — the sandbox never carries its own copy of a formula.
 *
 * Lives at `perp-sandbox/` in the repo root, so the paths below are
 * `../../common/src/perps/...`. It is deliberately NOT in the root
 * package.json workspaces list, so it never builds or ships with anything —
 * it is an analysis tool, not product code.
 */

export {
  // --- funding ---
  imbalance,
  computeFundingRate,
  applyFunding,
  applyFundingWithSolvency,
  assertPerpFundingConfig,
  // --- open interest & capacity ---
  getPerpOpenInterest,
  getPerpOpenInterestCapacity,
  isPerpOpenInterestWithinLimit,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
  // --- liquidation / ADL ---
  isLiquidated,
  processLiquidations,
  applyADL,
  // --- position math ---
  liquidationPrice,
  getUnrealizedEquity,
  getPositionValue,
  getLeverage,
  mergedEntryPrice,
  openPosition,
  closePosition,
  // --- solvency ---
  solvencyFactor,
  assertPerpStateSolvent,
  getPerpBackingPool,
  PERP_SOLVENCY_FACTOR_TOLERANCE,
} from '../../common/src/perps/amm'

export type {
  PerpState,
  PerpPool,
  AdlSettlement,
  PerpOpenInterestCapacity,
} from '../../common/src/perps/amm'

export {
  getPerpFundingRate,
  getFundingPeriodMs,
  FUNDING_PERIOD_MS,
  shouldApplyFunding,
  fundingPeriodUnit,
  fundingPeriodNoun,
} from '../../common/src/perps/funding'

export {
  calcPerpTakerFee,
  creditPerpPoolFee,
  accruePerpPositionTakerFee,
  getPerpTakerFeeBps,
  assertPerpTakerFeeConfig,
  PERP_TAKER_FEE_BPS_DEFAULT,
  PERP_TAKER_FEE_BPS_MAX,
} from '../../common/src/perps/fees'

export type {
  PerpPosition,
  PerpDirection,
} from '../../common/src/perps/position'

export { HOUR_MS, DAY_MS } from '../../common/src/util/time'
