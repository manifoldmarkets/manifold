import { APIHandler } from './helpers/endpoint'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { DAY_MS } from 'common/util/time'
import { getUnresolvedStatsForToken } from 'shared/update-user-portfolio-histories-core'
import { sortBy, uniqBy } from 'lodash'
import { MarketContract } from 'common/contract'

export const getDailyChangedMetricsAndContracts: APIHandler<
  'get-daily-changed-metrics-and-contracts'
> = async (props, auth) => {
  const { limit } = props
  const userId = auth.uid

  const since = Date.now() - DAY_MS
  // First update the user's metrics
  const { metricsByUser, contractsById } = await updateUserMetricPeriods(
    [userId],
    since,
    true
  )
  const manaStats = getUnresolvedStatsForToken(
    'MANA',
    metricsByUser[userId],
    contractsById
  )
  const cashStats = getUnresolvedStatsForToken(
    'CASH',
    metricsByUser[userId],
    contractsById
  )
  const manaMetrics = metricsByUser[userId].filter(
    (m) => contractsById[m.contractId]?.token === 'MANA'
  )
  const cashMetrics = metricsByUser[userId].filter(
    (m) => contractsById[m.contractId]?.token === 'CASH'
  )
  const topManaMetrics = sortBy(
    manaMetrics,
    (m) => -(m.from?.day.profit ?? 0)
  ).slice(0, limit / 2)
  const bottomManaMetrics = sortBy(
    manaMetrics,
    (m) => m.from?.day.profit ?? 0
  ).slice(0, limit / 2)
  const topCashMetrics = sortBy(
    cashMetrics,
    (m) => -(m.from?.day.profit ?? 0)
  ).slice(0, limit / 2)
  const bottomCashMetrics = sortBy(
    cashMetrics,
    (m) => m.from?.day.profit ?? 0
  ).slice(0, limit / 2)
  const uniqueContractIds = uniqBy(
    [
      ...topManaMetrics,
      ...bottomManaMetrics,
      ...topCashMetrics,
      ...bottomCashMetrics,
    ],
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
    cashMetrics: uniqBy(
      topCashMetrics.concat(bottomCashMetrics),
      (m) => m.contractId
    ),
    contracts,
    manaProfit: manaStats.dailyProfit,
    cashProfit: cashStats.dailyProfit,
    manaInvestmentValue: manaStats.value,
    cashInvestmentValue: cashStats.value,
  }
}
