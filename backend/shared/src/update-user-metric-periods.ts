import { DAY_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { contractColumnsToSelect, isProd, log } from 'shared/utils'
import { chunk, groupBy, sortBy, sumBy, uniq, uniqBy } from 'lodash'
import { Contract, CPMMMultiContract } from 'common/contract'
import {
  calculateMetricsByContractAndAnswer,
  isEmptyMetric,
  calculateProfitMetricsAtProbOrCancel,
} from 'common/calculate-metrics'
import { filterDefined } from 'common/util/array'
import { hasSignificantDeepChanges } from 'common/util/object'
import { convertBet } from 'common/supabase/bets'
import { ContractMetric } from 'common/contract-metric'
import { bulkUpdateDataQuery, bulkUpdateQuery } from './supabase/utils'
import { convertAnswer, convertContract } from 'common/supabase/contracts'

const CHUNK_SIZE = isProd() ? 400 : 10
export async function updateUserMetricPeriods(
  userIds?: string[],
  customSince?: number,
  skipUpdates?: boolean
) {
  log('Starting user period metrics update')
  const now = Date.now()
  const eightDays = DAY_MS * 8
  const oneDayAgo = now - DAY_MS
  const since = customSince ?? now - eightDays
  const daysAgo = Math.round((now - since) / DAY_MS)
  const pg = createSupabaseDirectClient()

  log('Loading active contract ids...')
  const activeContractIds = userIds
    ? []
    : await pg.map(
        `
    with recent_bets as (
      select distinct contract_id
      from contract_bets
      where created_time > now() - interval '${daysAgo} day'
    ),
    recent_contracts as (
      select distinct id as contract_id
      from contracts
      where resolution_time > now() - interval '${daysAgo} day'
    ),
    recent_answers as (
      select distinct a.contract_id
      from answers a
      where a.resolution_time > now() - interval '${daysAgo} day'
    )
    select distinct contract_id
    from (
      select contract_id from recent_bets
      union
      select contract_id from recent_contracts
      union
      select contract_id from recent_answers
    ) as combined_contracts;
    `,
        [],
        (r) => r.contract_id as string
      )
  log('Loading active users...')
  const allActiveUserIds = userIds
    ? userIds
    : await pg.map(
        `
      select distinct user_id from user_contract_metrics
      where contract_id in ($1:list)
      `,
        [activeContractIds],
        (r) => r.user_id as string
      )

  log(`Loaded ${allActiveUserIds.length} active users.`)
  const chunks = chunk(allActiveUserIds, CHUNK_SIZE)
  const metricsByUser: Record<string, ContractMetric[]> = {}
  const contractsById: Record<string, Contract> = {}
  
  for (const activeUserIds of chunks) {
    log(`Processing ${activeUserIds.length} users`)
    
    // Get contracts where users haven't bet in the past 24 hours
    const contractsWithoutRecentBets = await getContractsWithoutRecentBets(
      pg,
      activeUserIds,
      oneDayAgo
    )
    
    // Get contracts where users have bet in the past 24 hours
    log(`Loading bets for ${activeUserIds.length} users`)
    const metricRelevantBets = await getUnresolvedOrRecentlyResolvedBets(
      pg,
      activeUserIds,
      since,
      oneDayAgo // Only get bets for contracts with recent activity
    )
    log(
      `Loaded ${sumBy(
        Object.values(metricRelevantBets),
        (bets) => bets.length
      )} bets.`
    )

    const allBets = Object.values(metricRelevantBets).flat()
    const contractIdsWithBets = uniq(allBets.map((b) => b.contractId))
    const contractIdsWithoutBets = uniq(contractsWithoutRecentBets.map(m => m.contractId))
    const allContractIds = uniq([...contractIdsWithBets, ...contractIdsWithoutBets])
    
    if (allContractIds.length === 0) continue
    
    const newContractIds: string[] = allContractIds.filter(
      (c) => !contractsById[c]
    )
    log('Loading contracts, answers, users, and current contract metrics...')
    // We could cache the contracts and answers to query for less data
    const results = await pg.multi(
      `
      ${
        newContractIds.length > 0
          ? `select ${contractColumnsToSelect} from contracts where id in ($1:list);`
          : 'select 1 where false;'
      }
      ${
        newContractIds.length > 0
          ? `select * from answers where contract_id in ($1:list);`
          : 'select 1 where false;'
      }

      select id, data from user_contract_metrics
      where user_id in ($2:list)
      and contract_id in ($3:list);
    `,
      [newContractIds, activeUserIds, allContractIds]
    )
    const contracts = results[0].map(convertContract)
    const answers = results[1].map(convertAnswer)
    contracts.forEach((c) => {
      if (c.mechanism === 'cpmm-multi-1')
        contractsById[c.id] = {
          ...c,
          answers: answers.filter((a) => a.contractId === c.id),
        } as CPMMMultiContract
      else contractsById[c.id] = c
    })

    const currentContractMetrics = results[2].map(
      (r) => ({ id: r.id, ...r.data } as ContractMetric)
    )

    log(
      `Loaded ${contracts.length} contracts,
       ${answers.length} answers,
       and ${currentContractMetrics.length} contract metrics.`
    )

    const currentMetricsByUserId = groupBy(
      currentContractMetrics,
      (m) => m.userId
    )

    const contractMetricUpdates: Pick<
      ContractMetric,
      'from' | 'id' | 'profit' | 'payout' | 'profitPercent'
    >[] = []

    log('Computing metric updates...')
    for (const userId of activeUserIds) {
      const userMetricRelevantBets = metricRelevantBets[userId] ?? []
      const userMetricsWithoutBets = contractsWithoutRecentBets.filter(m => m.userId === userId)

      // Calculate metrics for contracts with recent bets (existing logic)
      const metricRelevantBetsByContract = groupBy(
        userMetricRelevantBets,
        (b) => b.contractId
      )
      const currentMetricsForUser = currentMetricsByUserId[userId] ?? []
      const freshMetricsFromBets = calculateMetricsByContractAndAnswer(
        metricRelevantBetsByContract,
        contractsById,
        userId,
        currentMetricsForUser
      )

      // Calculate metrics for contracts without recent bets using probability changes
      const freshMetricsFromProbChanges = calculateMetricsFromProbabilityChanges(
        userMetricsWithoutBets,
        contractsById
      )

      const freshMetrics = [...freshMetricsFromBets, ...freshMetricsFromProbChanges]
      
      metricsByUser[userId] = uniqBy(
        [...freshMetrics, ...currentMetricsForUser],
        (m) => m.contractId + m.answerId
      )
      contractMetricUpdates.push(
        ...filterDefined(
          freshMetrics.map((freshMetric) => {
            const currentMetric = currentMetricsForUser.find(
              (m) =>
                freshMetric.contractId === m.contractId &&
                freshMetric.answerId === m.answerId
            )
            if (!currentMetric) {
              if (!isEmptyMetric(freshMetric)) {
                log.error(
                  `Current metric not found for user ${userId}, contract ${freshMetric.contractId}, answer ${freshMetric.answerId}`
                )
              }
              return undefined
            }
            if (
              freshMetric.from &&
              hasSignificantDeepChanges(
                currentMetric.from ?? {},
                freshMetric.from,
                0.1
              )
            ) {
              return {
                id: currentMetric.id,
                from: freshMetric.from,
                payout: freshMetric.payout,
                profit: freshMetric.profit,
                profitPercent: freshMetric.profitPercent,
              }
            }
            return undefined
          })
        )
      )
    }
    log(`Computed ${contractMetricUpdates.length} metric updates.`)

    if (contractMetricUpdates.length > 0 && !skipUpdates) {
      log('Writing updates')
      const updateDataQuery = bulkUpdateDataQuery(
        'user_contract_metrics',
        contractMetricUpdates
      )
      const updateColumnsQuery = bulkUpdateQuery(
        'user_contract_metrics',
        ['id'],
        contractMetricUpdates.map((m) => ({
          id: m.id,
          profit: m.profit,
        })) as any[]
      )
      await pg
        .multi(`${updateDataQuery}; ${updateColumnsQuery};`)
        .catch((e) => log.error('Error updating contract metrics', e))
        .then(() =>
          log('Finished updating user period metrics.', {
            totalUpdates: contractMetricUpdates.length,
          })
        )
    }
  }
  log('Finished updating user period metrics')
  return { metricsByUser, contractsById }
}

// New function to get contracts where users haven't bet recently
const getContractsWithoutRecentBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  oneDayAgo: number
) => {
  const metrics = await pg.map(
    `
    select ucm.id, ucm.data, ucm.user_id, ucm.contract_id, ucm.answer_id
    from user_contract_metrics ucm
    join contracts c on ucm.contract_id = c.id
    left join answers a on ucm.answer_id = a.id
    where ucm.user_id in ($1:list)
      and ucm.has_shares = true
      and (c.resolution_time is null or c.resolution_time > $2)
      and (a is null or a.resolution_time is null or a.resolution_time > $2)
      and not exists (
        select 1 from contract_bets cb 
        where cb.user_id = ucm.user_id 
          and cb.contract_id = ucm.contract_id 
          and cb.created_time > $2
          and (ucm.answer_id is null or cb.answer_id = ucm.answer_id)
      )
    `,
    [userIds, new Date(oneDayAgo).toISOString()],
    (r) => ({
      id: r.id as number,
      userId: r.user_id as string,
      contractId: r.contract_id as string,
      answerId: r.answer_id as string | null,
      ...r.data
    } as ContractMetric)
  )

  return metrics
}

// New function to calculate metrics changes using probability changes
const calculateMetricsFromProbabilityChanges = (
  userMetrics: ContractMetric[],
  contractsById: Record<string, Contract>
): ContractMetric[] => {
  return userMetrics.map(metric => {
    const contract = contractsById[metric.contractId]
    if (!contract) return metric

    let newProb: number
    if (contract.mechanism === 'cpmm-multi-1' && metric.answerId) {
      const answer = (contract as CPMMMultiContract).answers.find(a => a.id === metric.answerId)
      if (!answer) return metric
      newProb = answer.prob
    } else if (contract.mechanism === 'cpmm-1') {
      newProb = (contract as any).prob
    } else {
      return metric
    }

    // Calculate new metrics based on probability change
    const updatedMetric = calculateProfitMetricsAtProbOrCancel(newProb, metric)
    
    // Calculate period profit changes (from calculatePeriodProfit logic)
    const calculatePeriodChange = (period: 'day' | 'week' | 'month') => {
      let probChange: number
      if (contract.mechanism === 'cpmm-multi-1' && metric.answerId) {
        const answer = (contract as CPMMMultiContract).answers.find(a => a.id === metric.answerId)
        probChange = answer?.probChanges[period] ?? 0
      } else if (contract.mechanism === 'cpmm-1') {
        probChange = (contract as any).probChanges?.[period] ?? 0
      } else {
        probChange = 0
      }

      const prevProb = newProb - probChange
      const { totalShares, totalAmountInvested = 0 } = metric
      
      // Calculate value change based on shares and probability change
      const yesShares = totalShares.YES ?? 0
      const noShares = totalShares.NO ?? 0
      
      const prevValue = yesShares * prevProb + noShares * (1 - prevProb)
      const currentValue = yesShares * newProb + noShares * (1 - newProb)
      const valueChange = currentValue - prevValue
      
      const profit = valueChange
      const invested = totalAmountInvested > 0 ? totalAmountInvested : Math.abs(totalAmountInvested) || 1
      const profitPercent = (profit / invested) * 100

      return {
        profit,
        profitPercent,
        invested: totalAmountInvested,
        prevValue,
        value: currentValue,
      }
    }

    // Update the from field with period changes
    const from = {
      day: calculatePeriodChange('day'),
      week: calculatePeriodChange('week'),
      month: calculatePeriodChange('month'),
    }

    return {
      ...updatedMetric,
      from,
    }
  })
}

const getUnresolvedOrRecentlyResolvedBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number,
  oneDayAgo?: number
) => {
  const bets = await pg.map(
    `
    select cb.amount, cb.shares, cb.outcome, cb.loan_amount, cb.user_id, cb.answer_id, cb.contract_id, cb.created_time, cb.is_redemption
    from contract_bets as cb
    join contracts as c on cb.contract_id = c.id
    left join answers as a on cb.answer_id = a.id
    where
      cb.user_id in ($1:list)
      and (c.resolution_time is null or c.resolution_time > $2)
      and (a is null or a.resolution_time is null or a.resolution_time > $2)
      ${oneDayAgo ? 'and cb.created_time > $3' : ''}
    `,
    [userIds, new Date(since).toISOString(), oneDayAgo ? new Date(oneDayAgo).toISOString() : undefined].filter(Boolean),
    convertBet
  )

  return groupBy(
    sortBy(bets, (b) => b.createdTime),
    (r) => r.userId as string
  )
}
