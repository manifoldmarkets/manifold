import { ContractMetric } from '../contract-metric'
import { DAY_MS } from '../util/time'
import { getPositionValue, unmergeEntryPrice } from './amm'
import { PerpDirection, PerpEvent, PerpPosition } from './position'

export const PERP_METRIC_PERIODS = ['day', 'week', 'month'] as const
export type PerpMetricPeriod = (typeof PERP_METRIC_PERIODS)[number]

export const PERP_METRIC_PERIOD_MS: Record<PerpMetricPeriod, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
}

type PeriodMetric = NonNullable<ContractMetric['from']>[string]

export type PerpMetricPeriodCutoff = {
  cutoff: number
  price: number | undefined
}

export type PerpMetricPeriodCutoffs = Record<
  PerpMetricPeriod,
  PerpMetricPeriodCutoff
>

export type PerpMetricPeriodCalculation = {
  from: Record<PerpMetricPeriod, PeriodMetric>
}

type ReplayedPosition = Pick<
  PerpPosition,
  'direction' | 'size' | 'costBasis' | 'originalCostBasis' | 'entryPrice'
>

type ReverseState = {
  positions: Partial<Record<PerpDirection, ReplayedPosition>>
  marginDeposited: number
  payouts: number
}

const ZERO_EPSILON = 1e-8

const finiteNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

const nearZero = (value: number) => Math.abs(value) <= ZERO_EPSILON
const clampNearZero = (value: number) => (nearZero(value) ? 0 : value)

const getEventDataNumber = (event: PerpEvent, key: string) =>
  finiteNumber(event.data?.[key])

const hasEventDataKey = (event: PerpEvent, key: string) =>
  event.data !== undefined &&
  Object.prototype.hasOwnProperty.call(event.data, key)

const orderedEvents = (events: PerpEvent[]) => {
  const seenIds: Record<string, boolean> = {}
  if (
    events.some((event) => {
      if (
        event.id === undefined ||
        !Number.isSafeInteger(event.id) ||
        !Number.isFinite(event.appliedTime) ||
        seenIds[event.id]
      ) {
        return true
      }
      seenIds[event.id] = true
      return false
    })
  ) {
    return undefined
  }
  return events.slice().sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
}

const initialPositions = (positions: PerpPosition[]) => {
  if (positions.length > 1) return undefined

  const result: ReverseState['positions'] = {}
  for (const position of positions) {
    if (
      (position.direction !== 'long' && position.direction !== 'short') ||
      !Number.isFinite(position.size) ||
      !Number.isFinite(position.costBasis) ||
      !Number.isFinite(position.originalCostBasis) ||
      !Number.isFinite(position.entryPrice) ||
      position.size <= 0 ||
      position.costBasis <= 0 ||
      position.originalCostBasis <= 0 ||
      position.entryPrice <= 0 ||
      result[position.direction] !== undefined
    ) {
      return undefined
    }
    result[position.direction] = {
      direction: position.direction,
      size: position.size,
      costBasis: position.costBasis,
      originalCostBasis: position.originalCostBasis,
      entryPrice: position.entryPrice,
    }
  }
  return result
}

const getPayout = (
  event: PerpEvent,
  requiresPayout: boolean
): number | undefined => {
  if (!requiresPayout && !hasEventDataKey(event, 'payout')) return 0
  const payout = getEventDataNumber(event, 'payout')
  return payout !== undefined && payout >= 0 ? payout : undefined
}

const reverseEvent = (
  positions: ReverseState['positions'],
  event: PerpEvent
) => {
  if (
    event.userId === null ||
    (event.direction !== 'long' && event.direction !== 'short') ||
    !Number.isFinite(event.ts)
  ) {
    return undefined
  }

  const sizeDelta = finiteNumber(event.sizeDelta)
  const costBasisDelta = finiteNumber(event.costBasisDelta)
  const originalCostBasisDelta = finiteNumber(event.originalCostBasisDelta)
  if (
    sizeDelta === undefined ||
    costBasisDelta === undefined ||
    originalCostBasisDelta === undefined
  ) {
    return undefined
  }

  const after = positions[event.direction]
  const afterSize = after?.size ?? 0
  const afterCostBasis = after?.costBasis ?? 0
  const afterOriginalCostBasis = after?.originalCostBasis ?? 0
  const beforeSize = clampNearZero(afterSize - sizeDelta)
  const beforeCostBasis = clampNearZero(afterCostBasis - costBasisDelta)
  const beforeOriginalCostBasis = clampNearZero(
    afterOriginalCostBasis - originalCostBasisDelta
  )
  if (beforeSize < 0 || beforeCostBasis < 0 || beforeOriginalCostBasis < 0) {
    return undefined
  }

  const isFullExit = afterSize === 0 && beforeSize > 0
  switch (event.eventType) {
    case 'open':
      if (
        sizeDelta <= 0 ||
        costBasisDelta <= 0 ||
        originalCostBasisDelta <= 0 ||
        beforeSize !== 0
      ) {
        return undefined
      }
      break
    case 'add':
      if (
        sizeDelta <= 0 ||
        costBasisDelta <= 0 ||
        originalCostBasisDelta <= 0 ||
        beforeSize <= 0 ||
        after === undefined
      ) {
        return undefined
      }
      break
    case 'close':
    case 'liquidation':
      if (
        sizeDelta >= 0 ||
        costBasisDelta >= 0 ||
        originalCostBasisDelta >= 0 ||
        !isFullExit
      ) {
        return undefined
      }
      break
    case 'funding':
      if (
        originalCostBasisDelta !== 0 ||
        beforeSize <= 0 ||
        afterSize <= 0 ||
        Math.sign(sizeDelta) !== Math.sign(costBasisDelta)
      ) {
        return undefined
      }
      break
    case 'adl':
      if (
        sizeDelta > 0 ||
        costBasisDelta > 0 ||
        originalCostBasisDelta > 0 ||
        beforeSize <= 0
      ) {
        return undefined
      }
      break
    default:
      return undefined
  }

  const payout = getPayout(
    event,
    event.eventType === 'close' ||
      event.eventType === 'liquidation' ||
      (event.eventType === 'adl' && isFullExit)
  )
  if (payout === undefined) return undefined

  const marginDeposited =
    (event.eventType === 'open' || event.eventType === 'add') &&
    originalCostBasisDelta > 0
      ? originalCostBasisDelta
      : 0

  if (beforeSize === 0) {
    if (!nearZero(beforeCostBasis) || !nearZero(beforeOriginalCostBasis)) {
      return undefined
    }
    delete positions[event.direction]
    return { marginDeposited, payout }
  }
  if (beforeCostBasis <= 0 || beforeOriginalCostBasis <= 0) return undefined

  let entryPrice: number | undefined
  if (event.eventType === 'add') {
    const eventPrice = finiteNumber(event.oraclePrice)
    if (eventPrice === undefined || eventPrice <= 0 || after === undefined) {
      return undefined
    }
    // Exact inverse of the harmonic merge in openPosition. These two must
    // always change together: inverting a different formula than the engine
    // applied reports historical P&L that never happened.
    entryPrice = unmergeEntryPrice(
      beforeSize,
      after.size,
      after.entryPrice,
      sizeDelta,
      eventPrice
    )
  } else if (after !== undefined) {
    entryPrice = after.entryPrice
  } else {
    entryPrice = getEventDataNumber(event, 'entryPrice')
  }
  if (
    entryPrice === undefined ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0
  ) {
    return undefined
  }

  positions[event.direction] = {
    direction: event.direction,
    size: beforeSize,
    costBasis: beforeCostBasis,
    originalCostBasis: beforeOriginalCostBasis,
    entryPrice,
  }
  return { marginDeposited, payout }
}

const reverseToCutoff = (
  currentPositions: PerpPosition[],
  events: PerpEvent[],
  cutoff: number
): ReverseState | undefined => {
  if (!Number.isFinite(cutoff)) return undefined
  const positions = initialPositions(currentPositions)
  if (!positions) return undefined

  const state: ReverseState = {
    positions,
    marginDeposited: 0,
    payouts: 0,
  }
  for (const event of events) {
    if (event.appliedTime < cutoff) continue
    const reversed = reverseEvent(state.positions, event)
    if (!reversed) return undefined
    state.marginDeposited += reversed.marginDeposited
    state.payouts += reversed.payout
  }
  if (
    !Number.isFinite(state.marginDeposited) ||
    !Number.isFinite(state.payouts)
  ) {
    return undefined
  }
  return state
}

const valuePositions = (
  positions: ReverseState['positions'],
  price: number | undefined
) => {
  const active = Object.values(positions)
  if (
    active.length > 0 &&
    (price === undefined || !Number.isFinite(price) || price <= 0)
  ) {
    return undefined
  }

  let value = 0
  for (const position of active) {
    const fullPosition: PerpPosition = {
      userId: '',
      contractId: '',
      direction: position.direction,
      size: position.size,
      costBasis: position.costBasis,
      originalCostBasis: position.originalCostBasis,
      entryPrice: position.entryPrice,
      leverage: position.size / position.costBasis,
      liquidationPrice: 0,
      openedTime: 0,
      updatedTime: 0,
    }
    value += getPositionValue(fullPosition, price ?? 0)
  }
  return Number.isFinite(value) && value >= -ZERO_EPSILON
    ? Math.max(0, value)
    : undefined
}

/**
 * Reconstructs each boundary by reversing at most 30 days of append-only
 * events from the authoritative current position. The cash-flow identity is:
 *
 *   period P&L = current value + payouts - boundary value - new margin
 *
 * Funding and partial ADL are captured in the reversed position state.
 */
export const calculatePerpMetricPeriods = (args: {
  currentPositions: PerpPosition[]
  events: PerpEvent[]
  currentPrice: number | undefined
  periods: PerpMetricPeriodCutoffs
}): PerpMetricPeriodCalculation | undefined => {
  const firstPosition = args.currentPositions[0]
  const firstEvent = args.events[0]
  const userId = firstPosition?.userId ?? firstEvent?.userId
  const contractId = firstPosition?.contractId ?? firstEvent?.contractId
  if (
    userId === null ||
    args.currentPositions.some(
      (position) =>
        position.userId !== userId || position.contractId !== contractId
    ) ||
    args.events.some(
      (event) => event.userId !== userId || event.contractId !== contractId
    )
  ) {
    return undefined
  }

  const currentPositions = initialPositions(args.currentPositions)
  const events = orderedEvents(args.events)
  if (!currentPositions || !events) return undefined

  const currentValue = valuePositions(currentPositions, args.currentPrice)
  if (currentValue === undefined) return undefined

  const fromEntries = PERP_METRIC_PERIODS.map((period) => {
    const { cutoff, price } = args.periods[period]
    const previous = reverseToCutoff(args.currentPositions, events, cutoff)
    if (!previous) return undefined
    const previousValue = valuePositions(previous.positions, price)
    if (previousValue === undefined) return undefined

    const profit =
      currentValue + previous.payouts - previousValue - previous.marginDeposited
    const invested = previousValue + previous.marginDeposited
    const profitPercent = invested > 0 ? (profit / invested) * 100 : 0
    if (
      !Number.isFinite(profit) ||
      !Number.isFinite(invested) ||
      !Number.isFinite(profitPercent)
    ) {
      return undefined
    }

    const value: PeriodMetric = {
      profit,
      profitPercent,
      invested,
      prevValue: previousValue,
      value: currentValue,
    }
    return [period, value] as const
  })
  if (fromEntries.some((entry) => entry === undefined)) return undefined

  return {
    from: Object.fromEntries(
      fromEntries as [PerpMetricPeriod, PeriodMetric][]
    ) as Record<PerpMetricPeriod, PeriodMetric>,
  }
}
