/**
 * House economics: how much of the market is financed by Manifold rather than
 * by traders, and what actually changes that.
 *
 * The structural fact this is built around, straight out of
 * `calculateAvailableCover` in common/src/perps/amm.ts:
 *
 *   cover(long) = poolShort - SUM over shorts of min(costBasis, value)
 *
 * A newly opened short adds its margin to poolShort AND reserves exactly that
 * much against itself, so cover moves by zero. A newly opened long consumes
 * long headroom and adds nothing either. Trader margin therefore CANNOT
 * finance capacity — not "does not currently", cannot. Every unit of cover
 * comes from one of:
 *
 *   1. house subsidy paid into a pool
 *   2. taker fees paid into a pool
 *   3. funding transferred into a pool
 *   4. opposing positions going underwater (their reserve shrinks with value)
 *   5. opposing positions being liquidated (reserve drops to zero, margin stays)
 *
 * Items 4 and 5 mean the market is best capitalised exactly when traders are
 * losing, and thinnest after a recovery. That is the dependency to break.
 */

import * as fs from 'fs'
import * as path from 'path'
import { PERP_OPEN_INTEREST_COVER_MULTIPLE } from './common'

export type LeverageBucket = {
  bucket: string
  direction: 'long' | 'short'
  n: number
  oi: number
  margin: number
}

export type BucketBook = {
  pulledAt: string
  poolLong: number
  poolShort: number
  oraclePrice: number
  liveTraderMargin: number
  takerFeesInLivePositions: number
  buckets: LeverageBucket[]
  organicVolume: { days: { d: string; opens: number; notional: number }[] }
}

const DATA_DIR = path.join(__dirname, '..', 'data')

export const loadBuckets = (file = 'btc-leverage-buckets.json'): BucketBook =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))

export type HouseView = {
  escrow: number
  traderMargin: number
  houseMoney: number
  houseSharePct: number
  openInterest: number
  aggregateLeverage: number
  /** Cover the current OI requires, at the 10x multiple. */
  coverRequired: number
  /** Net long exposure — what the house's money is actually exposed to. */
  netOi: number
  /** Cost to the house of an n% move against the net position. */
  moveCost: { movePct: number; cost: number; pctOfHouseMoney: number }[]
  /** Concentration: share of OI carried above a leverage threshold. */
  topBucket: { oi: number; margin: number; sharePct: number; impliedLeverage: number }
}

export const houseView = (book: BucketBook): HouseView => {
  const escrow = book.poolLong + book.poolShort
  const traderMargin = book.liveTraderMargin
  const houseMoney = escrow - traderMargin
  const oi = book.buckets.reduce((s, b) => s + b.oi, 0)
  const longOi = book.buckets
    .filter((b) => b.direction === 'long')
    .reduce((s, b) => s + b.oi, 0)
  const shortOi = oi - longOi
  const netOi = longOi - shortOi
  const top = book.buckets.filter((b) => b.bucket === '50-100')
  const topOi = top.reduce((s, b) => s + b.oi, 0)
  const topMargin = top.reduce((s, b) => s + b.margin, 0)

  return {
    escrow,
    traderMargin,
    houseMoney,
    houseSharePct: (houseMoney / escrow) * 100,
    openInterest: oi,
    aggregateLeverage: oi / traderMargin,
    coverRequired: oi / PERP_OPEN_INTEREST_COVER_MULTIPLE,
    netOi,
    moveCost: [5, 10, 20, 30].map((movePct) => {
      // A move of m against the net position transfers m * netOi out of the
      // pools. Ignores liquidations, which cap it — so this is an upper bound.
      const cost = (movePct / 100) * Math.abs(netOi)
      return {
        movePct,
        cost,
        pctOfHouseMoney: houseMoney > 0 ? (cost / houseMoney) * 100 : Infinity,
      }
    }),
    topBucket: {
      oi: topOi,
      margin: topMargin,
      sharePct: (topOi / oi) * 100,
      impliedLeverage: topMargin > 0 ? topOi / topMargin : Infinity,
    },
  }
}

export type CapScenario = {
  cap: number
  openInterest: number
  oiRemoved: number
  oiRemovedPct: number
  coverRequired: number
  /** House money needed on top of what traders' own losses provide. */
  houseMoneyNeeded: number
  houseMoneyFreed: number
  netOi: number
  worstMoveCost30: number
}

/**
 * What a leverage cap does, holding every trader's MARGIN fixed.
 *
 * A bucket whose implied leverage already sits under the cap is untouched;
 * one above it has its notional rewritten to margin x cap. This is the direct
 * mechanical consequence of the cap, not a behavioural forecast — traders
 * might instead post more margin to keep their exposure, which would be
 * better for the house, so treat this as the conservative reading.
 *
 * Bucket-level granularity means a cap landing inside a bucket's range is
 * approximate: the whole bucket is clipped on its aggregate leverage rather
 * than position by position.
 */
export const applyLeverageCap = (
  book: BucketBook,
  cap: number
): CapScenario => {
  const clip = (b: LeverageBucket) => {
    const implied = b.margin > 0 ? b.oi / b.margin : 0
    return implied > cap ? b.margin * cap : b.oi
  }
  const longOi = book.buckets
    .filter((b) => b.direction === 'long')
    .reduce((s, b) => s + clip(b), 0)
  const shortOi = book.buckets
    .filter((b) => b.direction === 'short')
    .reduce((s, b) => s + clip(b), 0)
  const oi = longOi + shortOi
  const before = book.buckets.reduce((s, b) => s + b.oi, 0)
  const view = houseView(book)
  const netOi = longOi - shortOi
  const coverRequired = oi / PERP_OPEN_INTEREST_COVER_MULTIPLE

  return {
    cap,
    openInterest: oi,
    oiRemoved: before - oi,
    oiRemovedPct: ((before - oi) / before) * 100,
    coverRequired,
    houseMoneyNeeded: coverRequired,
    houseMoneyFreed: view.coverRequired - coverRequired,
    netOi,
    worstMoveCost30: 0.3 * Math.abs(netOi),
  }
}

export type FeeEconomics = {
  organicNotionalPerDay: number
  feeBps: number
  revenuePerDay: number
  revenuePerYear: number
  houseMoney: number
  /** Years for accumulated fees to cover the house's current stake. */
  paybackYears: number
  /** Fee revenue as a share of house money, per year. */
  yieldOnHouseMoneyPct: number
}

export const feeEconomics = (
  book: BucketBook,
  feeBps: number
): FeeEconomics => {
  const days = book.organicVolume.days
  const perDay =
    days.reduce((s, d) => s + d.notional, 0) / Math.max(1, days.length)
  const revenuePerDay = perDay * (feeBps / 10_000)
  const revenuePerYear = revenuePerDay * 365
  const view = houseView(book)
  return {
    organicNotionalPerDay: perDay,
    feeBps,
    revenuePerDay,
    revenuePerYear,
    houseMoney: view.houseMoney,
    paybackYears: revenuePerYear > 0 ? view.houseMoney / revenuePerYear : Infinity,
    yieldOnHouseMoneyPct:
      view.houseMoney > 0 ? (revenuePerYear / view.houseMoney) * 100 : Infinity,
  }
}
