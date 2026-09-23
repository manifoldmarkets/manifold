import { getPositionValue, getUserFacingPnlPercent } from './pnl'
import { PerpPosition } from './position'
import { DAY_MS, HOUR_MS } from '../util/time'

export const PERP_ALERT_REASONS = [
  'perp_profit',
  'perp_loss',
  'perp_liquidation_warning',
] as const
export type PerpAlertReason = (typeof PERP_ALERT_REASONS)[number]

export const PERP_PROFIT_MILESTONES = [50, 100, 200, 500, 1000] as const
export const PERP_LOSS_MILESTONES = [25, 50] as const
export const PERP_PNL_ALERT_COOLDOWN_MS = HOUR_MS
export const PERP_PNL_ALERT_DAILY_LIMIT = 3
export const PERP_RISK_REARM_MS = 6 * HOUR_MS

export type PerpPositionAlertState = {
  openedTime: number
  profit: number
  loss: number
  risk: number
  lastRiskTime: number
}
export type PerpUserAlertState = {
  positions: Record<string, PerpPositionAlertState>
  pnlAlertTimes: number[]
}
export type PerpAlert = {
  reason: PerpAlertReason
  threshold: number
  pnlPercent: number
  remainingMarginPercent: number
}

const highestMilestone = (value: number, tiers: readonly number[]) =>
  tiers.reduce((highest, tier) => (value >= tier ? tier : highest), 0)

/** Returns at most one alert per observation. State survives restarts and is
 * independent of notification retention. Consumed milestones never replay,
 * including while disabled or rate limited. First observation baselines PnL
 * to avoid a rollout/re-enable backlog, but warns about existing risk. */
export const evaluatePerpPositionAlert = (
  position: PerpPosition,
  price: number,
  previous: PerpPositionAlertState | undefined,
  enabled: Record<PerpAlertReason, boolean>,
  allowPnl: boolean,
  now: number
): { state: PerpPositionAlertState; alert?: PerpAlert } | undefined => {
  if (
    ![
      price,
      position.size,
      position.entryPrice,
      position.costBasis,
      position.originalCostBasis,
      position.openedTime,
      position.takerFeeCostBasis ?? 0,
      position.liquidationPrice,
    ].every(Number.isFinite) ||
    price <= 0 ||
    position.size <= 0 ||
    position.entryPrice <= 0 ||
    position.costBasis <= 0 ||
    position.originalCostBasis <= 0 ||
    (position.takerFeeCostBasis ?? 0) < 0
  )
    return undefined

  const value = getPositionValue(position, price)
  // A crossed liquidation price belongs to the liquidation engine, not a
  // "close to liquidation" notification. Also excludes terminal positions.
  const distance =
    position.direction === 'long'
      ? price - position.liquidationPrice
      : position.liquidationPrice - price
  if (value <= 0 || distance <= 0) return undefined

  const pnlPercent = getUserFacingPnlPercent(position, price) * 100
  const remainingMarginPercent = (value / position.costBasis) * 100
  if (![pnlPercent, remainingMarginPercent].every(Number.isFinite))
    return undefined
  const profit = highestMilestone(pnlPercent, PERP_PROFIT_MILESTONES)
  const loss = highestMilestone(-pnlPercent, PERP_LOSS_MILESTONES)
  const prior =
    previous?.openedTime === position.openedTime ? previous : undefined
  const state: PerpPositionAlertState = {
    openedTime: position.openedTime,
    profit: Math.max(prior?.profit ?? 0, profit),
    loss: Math.max(prior?.loss ?? 0, loss),
    risk: prior?.risk ?? 0,
    lastRiskTime: prior?.lastRiskTime ?? 0,
  }
  // Hysteresis: crossing back over the warning threshold is not recovery.
  // Require >50% margin remaining AND six hours since the previous warning.
  if (
    remainingMarginPercent > 50 &&
    now - state.lastRiskTime >= PERP_RISK_REARM_MS
  ) {
    state.risk = 0
  }
  const risk =
    remainingMarginPercent <= 10 ? 2 : remainingMarginPercent <= 25 ? 1 : 0
  const makeAlert = (
    reason: PerpAlertReason,
    threshold: number
  ): PerpAlert => ({ reason, threshold, pnlPercent, remainingMarginPercent })
  if (risk > state.risk) {
    state.risk = risk
    state.lastRiskTime = now
    if (enabled.perp_liquidation_warning) {
      return {
        state,
        alert: makeAlert('perp_liquidation_warning', risk === 2 ? 10 : 25),
      }
    }
  }
  // Suppress PnL while at risk, even if risk alerts are muted. A single price
  // jump should not yield both a loss alert and a liquidation warning.
  if (prior && allowPnl && risk === 0) {
    if (profit > prior.profit && enabled.perp_profit)
      return { state, alert: makeAlert('perp_profit', profit) }
    if (loss > prior.loss && enabled.perp_loss)
      return { state, alert: makeAlert('perp_loss', loss) }
  }
  return { state }
}

export const recentPerpPnlAlertTimes = (times: number[], now: number) =>
  times.filter((time) => time > now - DAY_MS)

export const canSendPerpPnlAlert = (times: number[], now: number) => {
  const recent = recentPerpPnlAlertTimes(times, now)
  return (
    recent.length < PERP_PNL_ALERT_DAILY_LIMIT &&
    recent.every((time) => now - time >= PERP_PNL_ALERT_COOLDOWN_MS)
  )
}
