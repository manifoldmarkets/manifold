import { PerpContract } from '../contract'
import { YEAR_MS } from '../util/time'
import { computeFundingRate, getPerpBackingPool } from './amm'
import { getFundingPeriodMs } from './funding'
import { getOracleFreshness } from './oracle'

export type PerpEmbedStatus =
  | 'live'
  | 'stale'
  | 'unavailable'
  | 'settled'
  | 'cancelled'

export type PerpEmbedContract = Pick<
  PerpContract,
  | 'fundingPeriodMs'
  | 'fundingSensitivity'
  | 'isResolved'
  | 'maxFundingRate'
  | 'maxLeverage'
  | 'maxOraclePriceAgeMs'
  | 'oraclePrice'
  | 'oraclePriceTime'
  | 'poolLong'
  | 'poolShort'
  | 'resolution'
  | 'resolvedOraclePrice'
>

export type PerpEmbedSummary = {
  status: PerpEmbedStatus
  canTrade: boolean
  displayPrice: number
  priceLabel: 'Oracle price' | 'Final oracle price' | 'Last oracle price'
  backingPool: number
  maxLeverage: number | null
  funding: {
    rate: number
    annualizedRate: number
    periodMs: number
    payer: 'longs' | 'shorts' | null
  } | null
}

/**
 * Pure, defensive view model for small/off-site PERP cards.
 *
 * The full market and embeds must agree about whether the cached oracle can
 * execute a trade. Funding is recomputed from the current pools instead of
 * reading the last scheduler-applied rate, which can have the wrong sign
 * immediately after a trade changes the pool imbalance.
 */
export const getPerpEmbedSummary = (
  contract: PerpEmbedContract,
  now = Date.now(),
  skipOracleFreshness = false
): PerpEmbedSummary => {
  const isCancelled = contract.isResolved && contract.resolution === 'CANCEL'
  const isSettled = contract.isResolved && !isCancelled
  const finalPrice =
    typeof contract.resolvedOraclePrice === 'number' &&
    Number.isFinite(contract.resolvedOraclePrice)
      ? contract.resolvedOraclePrice
      : contract.oraclePrice
  const displayPrice = isSettled ? finalPrice : contract.oraclePrice

  const backingPool = getPerpBackingPool(contract.poolLong, contract.poolShort)
  const maxLeverage =
    Number.isFinite(contract.maxLeverage) && contract.maxLeverage > 0
      ? contract.maxLeverage
      : null

  if (isCancelled) {
    return {
      status: 'cancelled',
      canTrade: false,
      displayPrice,
      priceLabel: 'Last oracle price',
      backingPool,
      maxLeverage,
      funding: null,
    }
  }

  if (isSettled) {
    return {
      status: 'settled',
      canTrade: false,
      displayPrice,
      priceLabel: 'Final oracle price',
      backingPool,
      maxLeverage,
      funding: null,
    }
  }

  const freshness = getOracleFreshness(
    contract.oraclePriceTime,
    contract.maxOraclePriceAgeMs,
    now
  )
  const status: PerpEmbedStatus = skipOracleFreshness
    ? 'live'
    : freshness.status === 'fresh'
    ? 'live'
    : freshness.status === 'stale'
    ? 'stale'
    : 'unavailable'
  const periodMs = getFundingPeriodMs(contract)
  const rate = computeFundingRate(
    contract.poolLong,
    contract.poolShort,
    contract.fundingSensitivity,
    contract.maxFundingRate
  )
  const annualizedRate = rate * (YEAR_MS / periodMs)

  return {
    status,
    canTrade: status === 'live',
    displayPrice,
    priceLabel: 'Oracle price',
    backingPool,
    maxLeverage,
    funding: {
      rate,
      annualizedRate: Number.isFinite(annualizedRate) ? annualizedRate : 0,
      periodMs,
      payer: rate > 0 ? 'longs' : rate < 0 ? 'shorts' : null,
    },
  }
}
