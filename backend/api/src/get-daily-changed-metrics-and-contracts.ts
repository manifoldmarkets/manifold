import { APIError, APIHandler } from './helpers/endpoint'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { DAY_MS } from 'common/util/time'
import { getUnresolvedStatsForToken } from 'shared/update-user-portfolio-histories-core'
import { sortBy, uniqBy } from 'lodash'
import { MarketContract } from 'common/contract'

export const getDailyChangedMetricsAndContracts: APIHandler<
  'get-daily-changed-metrics-and-contracts'
> = async (props, auth) => {
  if (props.userId != auth.uid) {
    throw new APIError(403, 'You can only query your own changes')
  }
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
