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
} from 'common/calculate-metrics'
import { filterDefined } from 'common/util/array'
import { hasSignificantDeepChanges } from 'common/util/object'
import { convertBet } from 'common/supabase/bets'
import { ContractMetric } from 'common/contract-metric'
import { bulkUpdateDataQuery, bulkUpdateQuery } from './supabase/utils'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Answer } from 'common/answer'

const CHUNK_SIZE = isProd() ? 400 : 10
export async function updateUserMetricPeriods(
  userIds?: string[],
  customSince?: number,
  skipUpdates?: boolean
) {
  log('Starting user period metrics update')
  const now = Date.now()
  const eightDays = DAY_MS * 8
  const since = customSince ?? now - eightDays
  const daysAgo = Math.round((now - since) / DAY_MS)
  const oneDayAgo = now - DAY_MS
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
    log(`Loading recent bet data for ${activeUserIds.length} users`)
    
    // Find contracts where each user has bet in the past 24 hours
    const recentBetsByUser = await pg.map(
      `
      select user_id, contract_id
      from contract_bets
      where user_id in ($1:list)
      and created_time > $2
      `,
      [activeUserIds as string[], new Date(oneDayAgo).toISOString()],
      (r) => ({ userId: r.user_id as string, contractId: r.contract_id as string })
    )
    
    const recentBetContractsByUser = groupBy(recentBetsByUser, 'userId')
    const allRecentBetContractIds = uniq(recentBetsByUser.map(r => r.contractId))
    
    // Load bets only for contracts where users have bet recently
    const metricRelevantBets = await getUnresolvedOrRecentlyResolvedBets(
      pg,
      activeUserIds,
      since,
      allRecentBetContractIds // Only get bets for recently active contracts
    )
    
    log(
      `Loaded ${sumBy(
        Object.values(metricRelevantBets),
        (bets) => bets.length
      )} bets for recently active contracts.`
    )

    const allBets = Object.values(metricRelevantBets).flat()
    const betContractIds = uniq(allBets.map((b) => b.contractId))
    
    // Get current metrics for all users and all their contracts
    log('Loading current contract metrics and contracts with prob changes...')
    const currentMetricsResult = await pg.multi(
      `
      select id, data from user_contract_metrics
      where user_id in ($1:list);
      
      select ${contractColumnsToSelect} from contracts 
      where id in (
        select distinct contract_id from user_contract_metrics 
        where user_id in ($1:list)
      );
      
      select * from answers 
      where contract_id in (
        select distinct contract_id from user_contract_metrics 
        where user_id in ($1:list)
      );
    `,
      [activeUserIds as string[]]
    )
    
    const allCurrentMetrics = currentMetricsResult[0].map(
      (r) => ({ id: r.id, ...r.data } as ContractMetric)
    )
    const allContracts = currentMetricsResult[1].map(convertContract)
    const allAnswers = currentMetricsResult[2].map(convertAnswer)
    
    // Build contracts with answers
    allContracts.forEach((c) => {
      if (c.mechanism === 'cpmm-multi-1')
        contractsById[c.id] = {
          ...c,
          answers: allAnswers.filter((a) => a.contractId === c.id),
        } as CPMMMultiContract
      else contractsById[c.id] = c
    })

    log(
      `Loaded ${allContracts.length} contracts,
       ${allAnswers.length} answers,
       and ${allCurrentMetrics.length} total contract metrics.`
    )

    const currentMetricsByUserId = groupBy(
      allCurrentMetrics,
      (m) => m.userId
    )

    const contractMetricUpdates: Pick<
      ContractMetric,
      'from' | 'id' | 'profit' | 'payout' | 'profitPercent'
    >[] = []

    log('Computing metric updates...')
    for (const userId of activeUserIds) {
      const userRecentBetContracts = new Set(
        (recentBetContractsByUser[userId as string] || []).map(r => r.contractId)
      )
      const currentMetricsForUser = currentMetricsByUserId[userId as string] ?? []
      
      // Split metrics into two groups: those with recent bets and those without
      const metricsWithRecentBets = currentMetricsForUser.filter(m => 
        userRecentBetContracts.has(m.contractId)
      )
      const metricsWithoutRecentBets = currentMetricsForUser.filter(m => 
        !userRecentBetContracts.has(m.contractId)
      )
      
      // For contracts with recent bets, calculate normally using bets
      const userMetricRelevantBets = metricRelevantBets[userId as string] ?? []
      const metricRelevantBetsByContract = groupBy(
        userMetricRelevantBets,
        (b) => b.contractId
      )
      
      const freshMetricsFromBets = calculateMetricsByContractAndAnswer(
        metricRelevantBetsByContract,
        contractsById,
        userId,
        metricsWithRecentBets
      )
      
      // For contracts without recent bets, calculate using prob changes
      const freshMetricsFromProbChanges = calculateMetricsUsingProbChanges(
        metricsWithoutRecentBets,
        contractsById,
        allAnswers
      )
      
      // Combine all metrics
      const allFreshMetrics = [...freshMetricsFromBets, ...freshMetricsFromProbChanges]
      
      metricsByUser[userId as string] = uniqBy(
        [...allFreshMetrics, ...currentMetricsForUser],
        (m) => m.contractId + m.answerId
      )
      
      contractMetricUpdates.push(
        ...filterDefined(
          allFreshMetrics.map((freshMetric) => {
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

// New function to calculate metrics using probability changes
const calculateMetricsUsingProbChanges = (
  currentMetrics: ContractMetric[],
  contractsById: Record<string, Contract>,
  allAnswers: Answer[]
): ContractMetric[] => {
  return currentMetrics.map(metric => {
    const contract = contractsById[metric.contractId]
    if (!contract) return metric
    
    // Calculate value change based on probability changes
    let valueChange = 0
    
    if (contract.mechanism === 'cpmm-1') {
      // Binary/Pseudo-numeric contract
      const probChange = contract.probChanges?.day || 0
      const yesShares = metric.totalShares?.YES || 0
      const noShares = metric.totalShares?.NO || 0
      
      // YES shares gain value when prob increases, NO shares gain when prob decreases
      valueChange = (yesShares * probChange) + (noShares * -probChange)
    } else if (contract.mechanism === 'cpmm-multi-1') {
      // Multi-choice contract
      const contractAnswers = allAnswers.filter(a => a.contractId === contract.id)
      
      if (metric.answerId) {
        // Individual answer metric
        const answer = contractAnswers.find(a => a.id === metric.answerId)
        if (answer) {
          const probChange = answer.probChanges?.day || 0
          const yesShares = metric.totalShares?.YES || 0
          const noShares = metric.totalShares?.NO || 0
          
          valueChange = (yesShares * probChange) + (noShares * -probChange)
        }
      } else {
        // Summary metric - sum changes across all answers user has positions in
        contractAnswers.forEach(answer => {
          const answerMetric = currentMetrics.find(m => 
            m.contractId === contract.id && m.answerId === answer.id
          )
          if (answerMetric) {
            const probChange = answer.probChanges?.day || 0
            const yesShares = answerMetric.totalShares?.YES || 0
            const noShares = answerMetric.totalShares?.NO || 0
            
            valueChange += (yesShares * probChange) + (noShares * -probChange)
          }
        })
      }
    }
    
    // Update the metric with new values
    const newPayout = metric.payout + valueChange
    const newProfit = newPayout + metric.totalAmountSold - metric.totalAmountInvested
    const newProfitPercent = metric.totalAmountInvested === 0 
      ? 0 
      : (newProfit / metric.totalAmountInvested) * 100
    
    // Update the 'from' field with period changes
    const currentFrom = metric.from || {}
    const updatedFrom = {
      ...currentFrom,
      day: {
        ...currentFrom.day,
        profit: newProfit,
        profitPercent: newProfitPercent,
        invested: metric.totalAmountInvested,
        prevValue: currentFrom.day?.value || metric.payout,
        value: newPayout,
      }
    }
    
    return {
      ...metric,
      payout: newPayout,
      profit: newProfit,
      profitPercent: newProfitPercent,
      from: updatedFrom,
    }
  })
}

const getUnresolvedOrRecentlyResolvedBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number,
  contractIds?: string[] // New parameter to limit which contracts to get bets for
) => {
  const contractFilter = contractIds && contractIds.length > 0 
    ? 'and cb.contract_id in ($3:list)'
    : ''
  
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
      ${contractFilter}
    `,
    contractIds && contractIds.length > 0 
      ? [userIds, new Date(since).toISOString(), contractIds]
      : [userIds, new Date(since).toISOString()],
    convertBet
  )

  return groupBy(
    sortBy(bets, (b) => b.createdTime),
    (r) => r.userId as string
  )
}
