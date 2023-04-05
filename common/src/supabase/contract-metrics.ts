import { chunk, Dictionary, flatMap, groupBy, uniqBy } from 'lodash'
import { run, selectFrom, selectJson, SupabaseClient } from './utils'
import { ContractMetrics } from '../calculate-metrics'
import { getContracts } from './contracts'
import { Contract, CPMMContract } from '../contract'
import { ContractMetric } from 'common/contract-metric'

export async function getUserContractMetrics(
  userId: string,
  contractId: string,
  db: SupabaseClient
) {
  const { data } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .eq('contract_id', contractId)
  )
  return data.map((r) => r.data) as ContractMetrics[]
}

export async function getUserContractMetricsWithContracts(
  userId: string,
  db: SupabaseClient,
  count = 1000,
  start = 0
) {
  const { data } = await db.rpc('get_contract_metrics_with_contracts', {
    count,
    uid: userId,
    start,
  })
  const metricsByContract = {} as Dictionary<ContractMetrics>
  const contracts = [] as Contract[]
  flatMap(data).forEach((d) => {
    metricsByContract[d.contract_id] = d.metrics as ContractMetrics
    contracts.push(d.contract as Contract)
  })
  return { metricsByContract, contracts }
}

// To optimize this we should join on the contracts table
export async function getUserContractMetricsByProfitWithContracts(
  userId: string,
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all',
  limit = 20
) {
  const cms = await getBestAndWorstUserContractMetrics(userId, db, from, limit)
  const contracts = (await getContracts(
    cms.map((cm) => cm.contractId),
    db
  )) as CPMMContract[]
  return {
    metrics: cms,
    contracts,
  }
}

export async function getBestAndWorstUserContractMetrics(
  userId: string,
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all',
  limit: number
) {
  const orderString =
    from !== 'all' ? `data->from->${from}->profit` : 'data->profit'
  const { data: negative } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .order(orderString as any, {
        ascending: true,
      })
      .limit(limit)
  )
  const { data: profit } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .order(orderString as any, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit)
  )
  return uniqBy([...profit, ...negative], (d) => d.data.contractId).map(
    (d) => d.data
  ) as ContractMetrics[]
}

//TODO: Transition this to rpc call
export async function getUsersContractMetricsOrderedByProfit(
  userIds: string[],
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all'
) {
  const chunks = chunk(userIds, 100)
  const promises = chunks.map(async (chunk) => {
    const orderString =
      from !== 'all' ? `data->from->${from}->profit` : 'data->profit'
    const { data: negative } = await run(
      selectJson(db, 'user_contract_metrics')
        .in('user_id', chunk)
        .order(orderString as any, {
          ascending: true,
        })
    )
    const { data: profit } = await run(
      selectJson(db, 'user_contract_metrics')
        .in('user_id', chunk)
        .order(orderString as any, {
          ascending: false,
          nullsFirst: false,
        })
    )
    // We want most profitable and least profitable
    return [...profit, ...negative.reverse()].map(
      (d) => d.data
    ) as ContractMetrics[]
  })
  const results = await Promise.all(promises)
  const allContractMetrics: { [key: string]: ContractMetric[] } = groupBy(
    flatMap(results),
    'userId'
  )
  userIds.forEach((id) => {
    const myMetrics = allContractMetrics[id] ?? []
    const topAndLowestMetrics = [
      ...myMetrics.slice(0, 5),
      ...myMetrics.slice(-5),
    ]
    allContractMetrics[id] = uniqBy(topAndLowestMetrics, 'contractId')
  })
  return allContractMetrics
}

export async function getUsersRecentBetContractIds(
  userIds: string[],
  db: SupabaseClient,
  lastBetTime = 0
) {
  const chunks = chunk(userIds, 200)
  const promises = chunks.map(async (chunk) => {
    const { data } = await run(
      selectFrom(db, 'user_contract_metrics', 'userId', 'contractId')
        .in('user_id', chunk)
        .gt('data->lastBetTime', lastBetTime)
    )
    return data.map((d) => ({
      userId: d.userId,
      contractId: d.contractId,
    })) as Partial<ContractMetrics>[]
  })
  const results = await Promise.all(promises)
  return groupBy(flatMap(results), 'userId')
}

export async function getTotalContractMetrics(
  contractId: string,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('user_contract_metrics')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
      .gt('data->invested', 0)
  )
  return count
}

export async function getContractMetricsForContractId(
  contractId: string,
  db: SupabaseClient,
  order?: 'profit' | 'shares'
) {
  let q = db
    .from('user_contract_metrics')
    .select('*')
    .eq('contract_id', contractId)

  if (order === 'shares') {
    const noSharesQuery = db
      .from('user_contract_metrics')
      .select('*')
      .eq('contract_id', contractId)
      .eq(`data->hasNoShares`, true)
      .order(`data->totalShares->NO` as any, { ascending: false })

    q = q
      .eq(`data->hasYesShares`, true)
      .order(`data->totalShares->YES` as any, { ascending: false })

    const { data: yesData } = await run(q)
    const { data: noData } = await run(noSharesQuery)
    return yesData.concat(noData).map((d) => d.data) as ContractMetrics[]
  }

  q = q
    .neq(`data->profit`, null)
    .order(`data->profit` as any, { ascending: false })
  const { data } = await run(q)
  return data.map((d) => d.data) as ContractMetrics[]
}

export async function getShareholderCountsForContractId(
  contractId: string,
  db: SupabaseClient
) {
  const { count: noShareholders } = await run(
    db
      .from('user_contract_metrics')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
      .eq(`data->hasNoShares`, true)
  )

  const { count: yesShareholders } = await run(
    db
      .from('user_contract_metrics')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
      .eq(`data->hasYesShares`, true)
  )

  return {
    yesShareholders,
    noShareholders,
  }
}
export type ShareholderStats = Awaited<
  ReturnType<typeof getShareholderCountsForContractId>
>
