import {
  canSendPerpPnlAlert,
  evaluatePerpPositionAlert,
  PerpPositionAlertState,
  PERP_RISK_REARM_MS,
} from './alerts'
import { PerpPosition } from './position'
import { DAY_MS, HOUR_MS } from '../util/time'

const now = 10 * DAY_MS
const position: PerpPosition = {
  userId: 'u',
  contractId: 'c',
  direction: 'long',
  size: 1000,
  costBasis: 100,
  originalCostBasis: 100,
  takerFeeCostBasis: 0,
  entryPrice: 100,
  leverage: 10,
  liquidationPrice: 90,
  openedTime: now - DAY_MS,
  updatedTime: now,
}
const enabled = {
  perp_profit: true,
  perp_loss: true,
  perp_liquidation_warning: true,
}
const baseline = evaluatePerpPositionAlert(
  position,
  100,
  undefined,
  enabled,
  true,
  now
)!.state
const evaluate = (
  price: number,
  previous: PerpPositionAlertState | undefined = baseline,
  overrides: Partial<PerpPosition> = {},
  time = now
) =>
  evaluatePerpPositionAlert(
    { ...position, ...overrides },
    price,
    previous,
    enabled,
    true,
    time
  )!

it('baselines pre-existing PnL without a rollout backlog', () => {
  const result = evaluatePerpPositionAlert(
    position,
    120,
    undefined,
    enabled,
    true,
    now
  )!
  expect(result.alert).toBeUndefined()
  expect(result.state.profit).toBe(200)
  expect(evaluate(150, result.state).alert?.threshold).toBe(500)
})

it.each([
  ['long', 110],
  ['short', 90],
] as const)('alerts at +100%% for %s', (direction, price) => {
  const result = evaluate(price, baseline, {
    direction,
    liquidationPrice: direction === 'long' ? 90 : 110,
  })
  expect(result.alert).toMatchObject({
    reason: 'perp_profit',
    threshold: 100,
    pnlPercent: 100,
  })
})

it('collapses jumped tiers and never repeats a milestone after oscillation', () => {
  const jumped = evaluate(151)
  expect(jumped.alert?.threshold).toBe(500)
  const recovered = evaluate(110, jumped.state)
  expect(recovered.alert).toBeUndefined()
  expect(evaluate(151, recovered.state).alert).toBeUndefined()
})

it('uses net return including funding and opening fees', () => {
  expect(
    evaluate(110, baseline, { takerFeeCostBasis: 10 }).alert?.threshold
  ).toBe(50)
  expect(evaluate(100, baseline, { costBasis: 200 }).alert?.threshold).toBe(100)
  expect(evaluate(100, baseline, { costBasis: 60 }).alert).toMatchObject({
    reason: 'perp_loss',
    threshold: 25,
  })
})

it.each([
  [97.5, 25],
  [95, 50],
])('warns for losses at price %s', (price, threshold) => {
  expect(evaluate(price).alert).toMatchObject({
    reason: 'perp_loss',
    threshold,
  })
})

it('prioritizes risk over loss, including on first observation', () => {
  const result = evaluatePerpPositionAlert(
    position,
    92.5,
    undefined,
    enabled,
    false,
    now
  )!
  expect(result.alert).toMatchObject({
    reason: 'perp_liquidation_warning',
    threshold: 25,
  })
  expect(result.state.loss).toBe(50)
})

it('escalates risk without waiting for a PnL cooldown', () => {
  const warning = evaluate(92.5)
  const critical = evaluate(91, warning.state)
  expect(critical.alert?.threshold).toBe(10)
  expect(evaluate(91, critical.state).alert).toBeUndefined()
  expect(evaluate(92.5, critical.state).alert).toBeUndefined()
})

it('rearms risk only after substantial recovery and six hours', () => {
  const warning = evaluate(92.5)
  const tooSoon = evaluate(100, warning.state, {}, now + HOUR_MS)
  expect(
    evaluate(92.5, tooSoon.state, {}, now + 2 * HOUR_MS).alert
  ).toBeUndefined()
  const tooLittle = evaluate(94, warning.state, {}, now + PERP_RISK_REARM_MS)
  expect(
    evaluate(92.5, tooLittle.state, {}, now + PERP_RISK_REARM_MS).alert
  ).toBeUndefined()
  const recovered = evaluate(100, warning.state, {}, now + PERP_RISK_REARM_MS)
  expect(
    evaluate(92.5, recovered.state, {}, now + PERP_RISK_REARM_MS).alert
      ?.threshold
  ).toBe(25)
})

it('does not treat high leverage at entry as liquidation risk', () => {
  expect(
    evaluate(100, baseline, { size: 5000, leverage: 50, liquidationPrice: 98 })
      .alert
  ).toBeUndefined()
})

it('handles short liquidation risk with the opposite price direction', () => {
  expect(
    evaluate(107.5, baseline, { direction: 'short', liquidationPrice: 110 })
      .alert?.threshold
  ).toBe(25)
})

it('consumes muted and rate-limited milestones without replay on re-enable', () => {
  for (const [settings, allowPnl] of [
    [enabled, false],
    [
      { perp_profit: false, perp_loss: false, perp_liquidation_warning: false },
      true,
    ],
  ] as const) {
    const skipped = evaluatePerpPositionAlert(
      position,
      110,
      baseline,
      settings,
      allowPnl,
      now
    )!
    expect(skipped.alert).toBeUndefined()
    expect(evaluate(110, skipped.state).alert).toBeUndefined()
    expect(evaluate(120, skipped.state).alert?.threshold).toBe(200)
  }
})

it('retains consumed tiers on partial close and resets after reopen', () => {
  const hit = evaluate(110)
  expect(
    evaluate(110, hit.state, {
      size: 500,
      costBasis: 50,
      originalCostBasis: 50,
    }).alert
  ).toBeUndefined()
  const reopened = evaluate(100, hit.state, { openedTime: now })
  expect(reopened.state.profit).toBe(0)
  expect(
    evaluate(110, reopened.state, { openedTime: now }).alert?.threshold
  ).toBe(100)
})

it.each([0, -1, NaN, Infinity])('ignores invalid oracle price %s', (price) => {
  expect(evaluate(price)).toBeUndefined()
})

it.each([
  { size: 0 },
  { originalCostBasis: 0 },
  { costBasis: NaN },
  { takerFeeCostBasis: -1 },
  { liquidationPrice: Infinity },
])('ignores invalid position %j', (overrides) => {
  expect(evaluate(100, baseline, overrides)).toBeUndefined()
})

it('leaves crossed or reached liquidation prices to the engine', () => {
  expect(evaluate(90)).toBeUndefined()
  expect(evaluate(89)).toBeUndefined()
  expect(
    evaluate(111, baseline, { direction: 'short', liquidationPrice: 110 })
  ).toBeUndefined()
})

it('caps PnL across positions with a rolling day and an hourly cooldown', () => {
  expect(canSendPerpPnlAlert([], now)).toBe(true)
  expect(canSendPerpPnlAlert([now - HOUR_MS + 1], now)).toBe(false)
  expect(canSendPerpPnlAlert([now - HOUR_MS], now)).toBe(true)
  expect(
    canSendPerpPnlAlert(
      [now - 3 * HOUR_MS, now - 2 * HOUR_MS, now - HOUR_MS],
      now
    )
  ).toBe(false)
  expect(
    canSendPerpPnlAlert([now - DAY_MS, now - 2 * HOUR_MS, now - HOUR_MS], now)
  ).toBe(true)
})
