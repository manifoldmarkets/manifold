import { chunk, flatMap, groupBy, uniqBy } from 'lodash'
import { Row, run, SupabaseClient } from './utils'
import { ContractMetric } from 'common/contract-metric'

export async function getTopContractMetrics(
  contractId: string,
  limit: number,
  db: SupabaseClient
) {
  const { data } = await run(
    db
      .from('user_contract_metrics')
      .select('data, margin_loan, loan')
      .eq('contract_id', contractId)
      .order('profit', { ascending: false } as any)
      .is('answer_id', null)
      .limit(limit)
  )

  return data
    ? (data as any[]).map((doc) => ({
        ...(doc.data as ContractMetric),
        loan: doc.loan ?? (doc.data as any).loan ?? 0,
        marginLoan: doc.margin_loan ?? (doc.data as any).marginLoan ?? 0,
      } as ContractMetric))
    : []
}

export async function getRanking(
  contractId: string,
  profit: number,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('user_contract_metrics')
      .select('*', { count: 'exact' })
      .eq('contract_id', contractId)
      .is('answer_id', null)
      .gt('profit', profit)
  )

  return count + 1
}

export async function getCPMMContractUserContractMetrics(
  contractId: string,
  limit: number,
  answerId: string | null,
  db: SupabaseClient
) {
  async function fetchOutcomeMetrics(outcome: 'yes' | 'no') {
    const hasSharesColumn = `has_${outcome}_shares`
    const totalSharesColumn = `total_shares_${outcome}`
    let q = db
      .from('user_contract_metrics')
      .select('data, margin_loan, loan')
      .eq('contract_id', contractId)
      .eq(hasSharesColumn, true)
      .order(totalSharesColumn, { ascending: false } as any)
      .limit(limit)
    q = answerId ? q.eq('answer_id', answerId) : q.is('answer_id', null)
    const { data, error } = await q

    if (error) {
      throw error
    }

    return (data as any[]).map((doc) => ({
      ...(doc.data as ContractMetric),
      loan: doc.loan ?? (doc.data as any).loan ?? 0,
      marginLoan: doc.margin_loan ?? (doc.data as any).marginLoan ?? 0,
    } as ContractMetric))
  }

  try {
    const yesMetrics = await fetchOutcomeMetrics('yes')
    const noMetrics = await fetchOutcomeMetrics('no')
    return {
      YES: yesMetrics,
      NO: noMetrics,
    }
  } catch (error) {
    console.error('Error fetching user contract metrics:', error)
    return { YES: [], NO: [] }
  }
}

export async function getUsersContractMetricsOrderedByProfit(
  userIds: string[],
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all'
) {
  const chunks = chunk(userIds, 100)
  const promises = chunks.map(async (chunk) => {
    const orderString = from == 'all' ? 'profit' : `data->from->${from}->profit`
    const { data: negative } = await run(
      db
        .from('user_contract_metrics')
        .select('data, margin_loan, loan')
        .in('user_id', chunk)
        .is('answer_id', null)
        .order(orderString, { ascending: true })
    )
    const { data: profit } = await run(
      db
        .from('user_contract_metrics')
        .select('data, margin_loan, loan')
        .in('user_id', chunk)
        .is('answer_id', null)
        .order(orderString, { ascending: false, nullsFirst: false })
    )
    // We want most profitable and least profitable
    return ([...profit, ...negative.reverse()] as any[]).map((d) => ({
      ...(d.data as ContractMetric),
      loan: d.loan ?? (d.data as any).loan ?? 0,
      marginLoan: d.margin_loan ?? (d.data as any).marginLoan ?? 0,
    })) as ContractMetric[]
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

export async function getContractMetricsCount(
  contractId: string,
  db: SupabaseClient,
  outcome?: 'yes' | 'no',
  answerId?: string
) {
  let q = db
    .from('user_contract_metrics')
    .select('*', { head: true, count: 'exact' })
    .eq('contract_id', contractId)
    .eq('has_shares', true)

  q = answerId ? q.eq('answer_id', answerId) : q.is('answer_id', null)

  if (outcome) {
    q = q.eq(`has_${outcome}_shares`, true)
  }
  const { count } = await run(q)

  return count
}

export const convertContractMetricRows = (
  docs: Row<'user_contract_metrics'>[]
) =>
  uniqBy(
    docs.map((doc) => ({
      ...(doc.data as ContractMetric),
      loan: doc.loan ?? (doc.data as any)?.loan ?? 0,
      marginLoan: (doc as any).margin_loan ?? (doc.data as any)?.marginLoan ?? 0,
    } as ContractMetric)),
    (cm) => cm.userId + cm.answerId + cm.contractId
  )

export async function getOrderedContractMetricRowsForContractId(
  contractId: string,
  db: SupabaseClient,
  answerId?: string,
  order: 'profit' | 'shares' = 'profit',
  limit: number = 50,
  offset: number = 0
) {
  let query1 = db
    .from('user_contract_metrics')
    .select('*')
    .eq('contract_id', contractId)
  let query2 = db
    .from('user_contract_metrics')
    .select('*')
    .eq('contract_id', contractId)

  if (answerId) {
    query1.eq('answer_id', answerId)
    query2.eq('answer_id', answerId)
  } else {
    query1.is('answer_id', null)
    query2.is('answer_id', null)
  }

  if (order === 'shares') {
    query1.eq('has_yes_shares', true).order('total_shares_yes', {
      ascending: false,
    })
    query2
      .eq('has_no_shares', true)
      .order('total_shares_no', { ascending: false })
  } else {
    query1
      .order('profit', { ascending: false, nullsFirst: false })
      .gt('profit', 0)
    query2
      .order('profit', { ascending: true, nullsFirst: false })
      .lt('profit', 0)
  }

  query1 = query1.range(offset, offset + limit - 1)
  query2 = query2.range(offset, offset + limit - 1)

  const { data: q1Data } = await run(query1)
  const { data: q2Data } = await run(query2)
  return q1Data.concat(q2Data)
}

export async function getContractIdsWithMetrics(
  db: SupabaseClient,
  userId: string,
  contractIds: string[]
) {
  const { data } = await db
    .from('user_contract_metrics')
    .select('contract_id')
    .eq('user_id', userId)
    .eq('has_shares', true)
    .in('contract_id', contractIds)
    .is('answer_id', null)

  return data?.map((d) => d.contract_id) ?? []
}
