import {
  calculateMetricsByContractAndAnswer,
  calculateMetricsFromProbabilityChanges,
  isEmptyMetric,
} from 'common/calculate-metrics'
import { Contract, CPMMMultiContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { convertBet } from 'common/supabase/bets'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { hasSignificantDeepChanges } from 'common/util/object'
import { DAY_MS } from 'common/util/time'
import { chunk, groupBy, sortBy, sumBy, uniq, uniqBy } from 'lodash'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { contractColumnsToSelect, isProd, log } from 'shared/utils'
import { bulkUpdateDataQuery, bulkUpdateQuery } from './supabase/utils'

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

    // First, find contracts that users have bet on recently
    log(`Finding contracts with recent betting activity...`)
    const contractIdsWithRecentBets = await getContractIdsWithRecentBets(
      pg,
      activeUserIds,
      since
    )

    // Load bets for contracts with recent activity
    log(`Loading bets for contracts with recent activity...`)
    const metricRelevantBets = await getUnresolvedOrRecentlyResolvedBets(
      pg,
      activeUserIds,
      since,
      contractIdsWithRecentBets
    )
    log(
      `Loaded ${sumBy(
        Object.values(metricRelevantBets),
        (bets) => bets.length
      )} bets.`
    )

    // Get metrics for contracts WITHOUT recent betting activity
    log(`Loading metrics for contracts without recent betting activity...`)
    const contractMetricsWithoutRecentBets =
      await getContractMetricsWithoutRecentBets(
        pg,
        activeUserIds,
        since,
        contractIdsWithRecentBets
      )

    const contractIdsWithoutBets = uniq(
      contractMetricsWithoutRecentBets.map((m) => m.contractId)
    )
    const allContractIds = uniq([
      ...contractIdsWithRecentBets,
      ...contractIdsWithoutBets,
    ])

    if (allContractIds.length === 0) continue

    const newContractIds: string[] = allContractIds.filter(
      (c) => !contractsById[c]
    )
    log('Loading contracts, answers, users, and current contract metrics...')
    const contractIdsWithBets = allContractIds.filter(
      (c) => !contractIdsWithoutBets.includes(c)
    )
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

      ${
        contractIdsWithBets.length > 0
          ? `select id, data, margin_loan, loan from user_contract_metrics
              where user_id in ($2:list)
              and contract_id in ($3:list)`
          : `select 1 where false;`
      }
    `,
      [newContractIds, activeUserIds, contractIdsWithBets]
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

    const currentContractMetrics = results[2]
      .map(
        (r) =>
          ({
            id: r.id,
            ...r.data,
            loan: r.loan ?? r.data.loan ?? 0,
            marginLoan: r.margin_loan ?? r.data.marginLoan ?? 0,
          } as ContractMetric)
      )
      .concat(contractMetricsWithoutRecentBets)

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
      const userMetricsWithoutBets = contractMetricsWithoutRecentBets.filter(
        (m) => m.userId === userId
      )

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
      const freshMetricsFromProbChanges =
        calculateMetricsFromProbabilityChanges(
          userMetricsWithoutBets,
          contractsById
        )

      const freshMetrics = [
        ...freshMetricsFromBets,
        ...freshMetricsFromProbChanges,
      ]

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
  log('Finished running user metrics period update')
  return { metricsByUser, contractsById }
}

// New function to get contract IDs with recent betting activity
const getContractIdsWithRecentBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number
) => {
  const contractIds = await pg.map(
    `
    select distinct cb.contract_id
    from contract_bets cb
      where cb.user_id in ($1:list)
      and cb.created_time > $2
    `,
    [userIds, new Date(since).toISOString()],
    (r) => r.contract_id as string
  )

  return contractIds
}

const getContractMetricsWithoutRecentBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number,
  contractIdsWithRecentBets: string[]
) => {
  const excludeClause =
    contractIdsWithRecentBets.length > 0
      ? 'and ucm.contract_id not in ($3:list)'
      : ''

  const metrics = await pg.map(
    `
    select ucm.id, ucm.data, ucm.margin_loan, ucm.loan
    from user_contract_metrics ucm
    join contracts c on ucm.contract_id = c.id
    left join answers a on ucm.answer_id = a.id
    where ucm.user_id in ($1:list)
      and ucm.has_shares = true
      and (c.resolution_time is null or c.resolution_time > $2)
      and (a is null or a.resolution_time is null or a.resolution_time > $2)
      ${excludeClause}
    `,
    [userIds, new Date(since).toISOString(), contractIdsWithRecentBets],
    (r) =>
      ({
        id: r.id as number,
        ...r.data,
        loan: r.loan ?? r.data.loan ?? 0,
        marginLoan: r.margin_loan ?? r.data.marginLoan ?? 0,
      } as ContractMetric)
  )

  return metrics
}

const getUnresolvedOrRecentlyResolvedBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number,
  contractIds: string[]
) => {
  if (contractIds.length === 0) {
    return {}
  }

  const bets = await pg.map(
    `
    select cb.amount, cb.shares, cb.outcome, cb.loan_amount, cb.user_id, cb.answer_id, cb.contract_id, cb.created_time, cb.is_redemption
    from contract_bets as cb
    join contracts as c on cb.contract_id = c.id
    left join answers as a on cb.answer_id = a.id
    where
      cb.user_id in ($1:list)
      and cb.contract_id in ($3:list)
      and (c.mechanism != 'cpmm-multi-1' or not cb.is_redemption)
      and (c.resolution_time is null or c.resolution_time > $2)
      and (a is null or a.resolution_time is null or a.resolution_time > $2)
    `,
    [userIds, new Date(since).toISOString(), contractIds],
    convertBet
  )

  return groupBy(
    sortBy(bets, (b) => b.createdTime),
    (r) => r.userId as string
  )
}
