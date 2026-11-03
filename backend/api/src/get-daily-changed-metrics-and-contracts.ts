import { APIError, APIHandler } from './helpers/endpoint'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { DAY_MS, MINUTE_MS } from 'common/util/time'
import { getUnresolvedStatsForToken } from 'shared/update-user-portfolio-histories-core'
import { createSingleFlightCache } from 'shared/helpers/single-flight-cache'
import { sortBy, uniqBy } from 'lodash'
import { MarketContract } from 'common/contract'
import { ValidatedAPIParams } from 'common/api/schema'

// Recomputing a user's period metrics costs seconds of CPU for accounts with
// thousands of positions, and the home page used to call this on every balance
// change. A bot placing ~1k bets/min with the page open saturated every read
// worker (2026-11-03). Serve one computation per user per minute per process.
// The cached result carries the balance it was computed with, so net worth
// (investment value + balance) stays one consistent snapshot.
const dailyChangesCache = createSingleFlightCache<
  Awaited<ReturnType<typeof computeDailyChanges>>
>({ ttlMs: MINUTE_MS, maxEntries: 1000 })

export const getDailyChangedMetricsAndContracts: APIHandler<
  'get-daily-changed-metrics-and-contracts'
> = async (props, auth) => {
  if (props.userId != auth.uid) {
    throw new APIError(403, 'You can only query your own changes')
  }
  return await dailyChangesCache.get(`${props.userId}:${props.limit}`, () =>
    computeDailyChanges(props)
  )
}

const computeDailyChanges = async (
  props: ValidatedAPIParams<'get-daily-changed-metrics-and-contracts'>
) => {
  const { userId, limit, balance } = props

  const since = Date.now() - DAY_MS
  // First update the user's metrics
  const { metricsByUser, contractsById } = await updateUserMetricPeriods(
    [userId],
    since,
    true
  )
  const userMetrics = metricsByUser[userId] ?? []
  const manaStats = getUnresolvedStatsForToken(
    'MANA',
    userMetrics,
    contractsById
  )
  const manaMetrics = userMetrics.filter(
    (m) => contractsById[m.contractId]?.token === 'MANA'
  )
  const topManaMetrics = sortBy(
    manaMetrics,
    (m) => -(m.from?.day.profit ?? 0)
  ).slice(0, limit / 2)
  const bottomManaMetrics = sortBy(
    manaMetrics,
    (m) => m.from?.day.profit ?? 0
  ).slice(0, limit / 2)
  const uniqueContractIds = uniqBy(
    [...topManaMetrics, ...bottomManaMetrics],
    'contractId'
  ).map((m) => m.contractId)
  const contracts = Object.values(contractsById).filter((c) =>
    uniqueContractIds.includes(c.id)
  ) as MarketContract[]
  return {
    manaMetrics: uniqBy(
      topManaMetrics.concat(bottomManaMetrics),
      (m) => m.contractId
    ),
    cashMetrics: [],
    contracts,
    manaProfit: manaStats.dailyProfit,
    cashProfit: 0,
    manaInvestmentValue: manaStats.value,
    cashInvestmentValue: 0,
    balance,
  }
}
