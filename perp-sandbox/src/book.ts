/** Loading the live prod book, and constructing synthetic ones. */

import * as fs from 'fs'
import * as path from 'path'
import {
  getPerpOpenInterest,
  getUnrealizedEquity,
  liquidationPrice,
  PerpDirection,
  PerpPosition,
  PerpState,
} from './common'

export type Snapshot = {
  pulledAt: string
  contractId: string
  slug: string
  poolLong: number
  poolShort: number
  oraclePrice: number
  fundingSensitivity: number
  maxFundingRate: number
  storedFundingRate: number
  fundingPeriodMs: number
  lastFundingTime: number
  openInterestLong: number
  openInterestShort: number
  takerFeeBps: number | null
  maxLeverage: number
  positions: Omit<PerpPosition, 'contractId'>[]
}

const DATA_DIR = path.join(__dirname, '..', 'data')

export const loadSnapshot = (file = 'btc-snapshot.json'): Snapshot =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')) as Snapshot

export type ParamEra = {
  /** Exclusive upper bound on the event ts; null = open-ended (current). */
  untilTs: string | null
  fundingSensitivity: number
  maxFundingRate: number
  source: 'contract' | 'recovered'
}

export type FundingEventLog = {
  fundingSensitivity: number
  maxFundingRate: number
  paramHistory: ParamEra[]
  events: [string, number, number, number, number, number, number][]
}

/** The config in force at an event, per the recovered parameter history. */
export const paramsAt = (log: FundingEventLog, ts: string): ParamEra => {
  for (const era of log.paramHistory) {
    if (era.untilTs === null || ts < era.untilTs) return era
  }
  return log.paramHistory[log.paramHistory.length - 1]
}

export const loadFundingEvents = (
  file = 'btc-funding-events.json'
): FundingEventLog =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))

/** Snapshot -> the exact PerpState shape the AMM functions consume. */
export const snapshotToState = (snap: Snapshot): PerpState => ({
  pool: { L: snap.poolLong, S: snap.poolShort },
  positions: snap.positions.map((p) => ({ ...p, contractId: snap.contractId })),
})

/** Structural clone, so a scenario can never mutate another's starting book. */
export const cloneState = (state: PerpState): PerpState => ({
  pool: { ...state.pool },
  positions: state.positions.map((p) => ({ ...p })),
})

export type BookStats = {
  numLong: number
  numShort: number
  oiLong: number
  oiShort: number
  marginLong: number
  marginShort: number
  leverageMin: number
  leverageMax: number
  leverageMedian: number
  leverageMean: number
  /** Notional-weighted mean leverage — what actually drives pool/OI divergence. */
  leverageWeighted: number
  unrealizedLong: number
  unrealizedShort: number
}

export const bookStats = (state: PerpState, price: number): BookStats => {
  const live = state.positions.filter((p) => p.size > 0)
  const longs = live.filter((p) => p.direction === 'long')
  const shorts = live.filter((p) => p.direction === 'short')
  const oi = getPerpOpenInterest(state.positions)
  const levs = live.map((p) => p.leverage).sort((a, b) => a - b)
  const mid = Math.floor(levs.length / 2)
  const median = levs.length
    ? levs.length % 2
      ? levs[mid]
      : (levs[mid - 1] + levs[mid]) / 2
    : 0
  const totalSize = live.reduce((s, p) => s + p.size, 0)
  const sum = (ps: PerpPosition[], f: (p: PerpPosition) => number) =>
    ps.reduce((s, p) => s + f(p), 0)

  return {
    numLong: longs.length,
    numShort: shorts.length,
    oiLong: oi.long,
    oiShort: oi.short,
    marginLong: sum(longs, (p) => p.costBasis),
    marginShort: sum(shorts, (p) => p.costBasis),
    leverageMin: levs.length ? levs[0] : 0,
    leverageMax: levs.length ? levs[levs.length - 1] : 0,
    leverageMedian: median,
    leverageMean: levs.length
      ? levs.reduce((s, l) => s + l, 0) / levs.length
      : 0,
    leverageWeighted: totalSize
      ? sum(live, (p) => p.leverage * p.size) / totalSize
      : 0,
    unrealizedLong: sum(longs, (p) => getUnrealizedEquity(p, price)),
    unrealizedShort: sum(shorts, (p) => getUnrealizedEquity(p, price)),
  }
}

/**
 * Build a position the way `openPosition` would, at a given entry price.
 * Leverage and liquidation price come from common/, not from arithmetic here.
 */
export const makePosition = (args: {
  userId: string
  contractId: string
  direction: PerpDirection
  margin: number
  leverage: number
  entryPrice: number
  now?: number
}): PerpPosition => {
  const { userId, contractId, direction, margin, leverage, entryPrice } = args
  const now = args.now ?? 0
  return {
    userId,
    contractId,
    direction,
    size: margin * leverage,
    costBasis: margin,
    originalCostBasis: margin,
    takerFeeCostBasis: 0,
    entryPrice,
    leverage,
    liquidationPrice: liquidationPrice(direction, entryPrice, leverage),
    openedTime: now,
    updatedTime: now,
  }
}

/**
 * Scenario 3's book: N longs at high leverage against one whale short at 1x,
 * balanced on notional and wildly unbalanced on margin.
 */
export const leverageAsymmetryBook = (args: {
  numLongs: number
  longMargin: number
  longLeverage: number
  shortMargin: number
  shortLeverage: number
  price: number
  /**
   * Scales BOTH pools by (1 + eps), preserving their ratio exactly while
   * lifting available cover off exactly zero.
   *
   * Needed because a book where every position sits at its entry price has
   * cover == 0 on both sides by construction (pool == sum of that side's
   * margins). Funding then scales positions individually and the pool in
   * aggregate; those two float paths differ by ~1 ulp, and when the result
   * lands at -1e-12, `solvencyFactor` returns -Infinity (its E<=0 branch is a
   * bare `availableCover >= 0` test with no tolerance) and
   * `assertPerpStateSolvent` aborts the tick. Real markets carry accumulated
   * taker fees and subsidy, so they do not sit on this knife edge; the epsilon
   * stands in for that. Set to 0 to reproduce the abort.
   */
  coverEpsilon?: number
}): PerpState => {
  const contractId = 'synthetic-asymmetry'
  const longs = Array.from({ length: args.numLongs }, (_, i) =>
    makePosition({
      userId: `long-${i + 1}`,
      contractId,
      direction: 'long',
      margin: args.longMargin,
      leverage: args.longLeverage,
      entryPrice: args.price,
    })
  )
  const short = makePosition({
    userId: 'whale-short',
    contractId,
    direction: 'short',
    margin: args.shortMargin,
    leverage: args.shortLeverage,
    entryPrice: args.price,
  })
  const eps = args.coverEpsilon ?? 0
  return {
    pool: {
      L: args.numLongs * args.longMargin * (1 + eps),
      S: args.shortMargin * (1 + eps),
    },
    positions: [...longs, short],
  }
}
