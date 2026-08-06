import {
  calculateMetricsByContractAndAnswer,
  calculateMetricsFromProbabilityChanges,
  isEmptyMetric,
} from 'common/calculate-metrics'
import { Contract, CPMMMultiContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { PERP_METRIC_PERIOD_MS } from 'common/perps/metric-periods'
import { convertBet } from 'common/supabase/bets'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { hasSignificantDeepChanges } from 'common/util/object'
import { DAY_MS } from 'common/util/time'
import { chunk, groupBy, sortBy, sumBy, uniq, uniqBy } from 'lodash'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { contractColumnsToSelect, isProd, log } from 'shared/utils'
import { calculatePerpPeriodMetricUpdates } from './perps/user-contract-metric-periods'
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
  // Keep closed PERPs active beyond the longest reported window so the month
  // value gets several daily chances to receive its final zero update.
  const perpSince = Math.min(
    since,
    now - PERP_METRIC_PERIOD_MS.month - eightDays
  )
  const perpDaysAgo = Math.ceil((now - perpSince) / DAY_MS)
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
    ),
    recent_perp_events as (
      select distinct contract_id
      from contract_perp_events
      where user_id is not null
        and applied_ts > now() - interval '${perpDaysAgo} day'
    ),
    open_perp_contracts as (
      select distinct contract_id
      from contract_perp_positions
    )
    select distinct contract_id
    from (
      select contract_id from recent_bets
      union
      select contract_id from recent_contracts
      union
      select contract_id from recent_answers
      union
      select contract_id from recent_perp_events
      union
      select contract_id from open_perp_contracts
    ) as combined_contracts;
    `,
        [],
        (r) => r.contract_id as string
      )
  log('Loading active users...')
  const allActiveUserIds = userIds
    ? userIds
    : activeContractIds.length === 0
    ? []
    : await pg.map(
        `
      select distinct ucm.user_id
      from user_contract_metrics ucm
      join contracts c on c.id = ucm.contract_id
      where ucm.contract_id in ($1:list)
        and (
          c.mechanism != 'perp'
          or ucm.has_shares = true
          or exists (
            select 1
            from contract_perp_events e
            where e.contract_id = ucm.contract_id
              and e.user_id = ucm.user_id
              and e.applied_ts > now() - interval '${perpDaysAgo} day'
          )
        )
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

    log(`Finding contracts with recent metric activity...`)
    const contractIdsWithRecentActivity =
      await getContractIdsWithRecentMetricActivity(
        pg,
        activeUserIds,
        since,
        perpSince
      )

    // Load ordinary bets for contracts with recent metric activity. PERP
    // events are replayed separately below.
    log(`Loading bets for contracts with recent activity...`)
    const metricRelevantBets = await getUnresolvedOrRecentlyResolvedBets(
      pg,
      activeUserIds,
      since,
      contractIdsWithRecentActivity
    )
    log(
      `Loaded ${sumBy(
        Object.values(metricRelevantBets),
        (bets) => bets.length
      )} bets.`
    )

    // Open positions still need period marking even without a recent action.
    log(`Loading metrics for contracts without recent metric activity...`)
    const contractMetricsWithoutRecentActivity =
      await getContractMetricsWithoutRecentActivity(
        pg,
        activeUserIds,
        since,
        contractIdsWithRecentActivity
      )

    const contractIdsWithoutActivity = uniq(
      contractMetricsWithoutRecentActivity.map((m) => m.contractId)
    )
    const allContractIds = uniq([
      ...contractIdsWithRecentActivity,
      ...contractIdsWithoutActivity,
    ])

    if (allContractIds.length === 0) continue

    const newContractIds: string[] = allContractIds.filter(
      (c) => !contractsById[c]
    )
    log('Loading contracts, answers, users, and current contract metrics...')
    const contractIdsWithActivity = allContractIds.filter(
      (contractId) => !contractIdsWithoutActivity.includes(contractId)
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
        contractIdsWithActivity.length > 0
          ? `select id, data, margin_loan, loan from user_contract_metrics
              where user_id in ($2:list)
               and contract_id in ($3:list)`
          : `select 1 where false;`
      }
    `,
      [newContractIds, activeUserIds, contractIdsWithActivity]
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
      .concat(contractMetricsWithoutRecentActivity)

    log(
      `Loaded ${contracts.length} contracts,
       ${answers.length} answers,
       and ${currentContractMetrics.length} contract metrics.`
    )

    const currentMetricsByUserId = groupBy(
      currentContractMetrics,
      (m) => m.userId
    )
    const perpMetricTargets = currentContractMetrics
      .filter(
        (metric) =>
          metric.answerId === null &&
          contractsById[metric.contractId]?.mechanism === 'perp'
      )
      .map((metric) => ({
        userId: metric.userId,
        contractId: metric.contractId,
      }))
    const freshPerpMetrics = await calculatePerpPeriodMetricUpdates({
      pg,
      targets: perpMetricTargets,
    })
    const freshPerpMetricsByUserId = groupBy(
      freshPerpMetrics,
      (metric) => metric.userId
    )

    const contractMetricUpdates: Pick<
      ContractMetric,
      'from' | 'id' | 'profit' | 'payout' | 'profitPercent'
    >[] = []
    const perpPeriodUpdates: Pick<ContractMetric, 'from' | 'id'>[] = []

    log('Computing metric updates...')
    for (const userId of activeUserIds) {
      const userMetricRelevantBets = metricRelevantBets[userId] ?? []
      const userMetricsWithoutActivity =
        contractMetricsWithoutRecentActivity.filter(
          (metric) => metric.userId === userId
        )

      // Calculate ordinary metrics for contracts with recent bets.
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

      // Calculate ordinary metrics without recent activity using probability
      // changes. PERPs reverse recent events from authoritative positions.
      const freshMetricsFromProbChanges =
        calculateMetricsFromProbabilityChanges(
          userMetricsWithoutActivity.filter(
            (metric) => contractsById[metric.contractId]?.mechanism !== 'perp'
          ),
          contractsById
        )
      const freshPerpMetricsForUser = freshPerpMetricsByUserId[userId] ?? []

      const freshMetrics = [
        ...freshMetricsFromBets,
        ...freshMetricsFromProbChanges,
        ...freshPerpMetricsForUser,
      ]

      metricsByUser[userId] = uniqBy(
        [...freshMetrics, ...currentMetricsForUser],
        (m) => m.contractId + m.answerId
      )
      for (const freshMetric of freshMetrics) {
        const currentMetric = currentMetricsForUser.find(
          (metric) =>
            freshMetric.contractId === metric.contractId &&
            freshMetric.answerId === metric.answerId
        )
        if (!currentMetric) {
          if (!isEmptyMetric(freshMetric)) {
            log.error(
              `Current metric not found for user ${userId}, contract ${freshMetric.contractId}, answer ${freshMetric.answerId}`
            )
          }
          continue
        }
        const isPerpMetric =
          contractsById[freshMetric.contractId]?.mechanism === 'perp'
        if (
          !freshMetric.from ||
          !hasSignificantDeepChanges(
            currentMetric.from ?? {},
            freshMetric.from,
            // Ordinary markets retain the historical write-noise threshold.
            // PERPs need exact rolloff so a closed sub-M$0.10 result cannot
            // remain in day/week/month indefinitely.
            isPerpMetric ? 0 : 0.1
          )
        ) {
          continue
        }

        if (isPerpMetric) {
          // The PERP engine owns every current/lifetime field. This job may
          // race a trade or funding tick, so atomically patch only history.
          perpPeriodUpdates.push({
            id: currentMetric.id,
            from: freshMetric.from,
          })
        } else {
          contractMetricUpdates.push({
            id: currentMetric.id,
            from: freshMetric.from,
            payout: freshMetric.payout,
            profit: freshMetric.profit,
            profitPercent: freshMetric.profitPercent,
          })
        }
      }
    }
    const totalUpdates = contractMetricUpdates.length + perpPeriodUpdates.length
    log(`Computed ${totalUpdates} metric updates.`)

    if (totalUpdates > 0 && !skipUpdates) {
      log('Writing updates')
      const queries: string[] = []
      if (contractMetricUpdates.length > 0) {
        queries.push(
          bulkUpdateDataQuery('user_contract_metrics', contractMetricUpdates),
          bulkUpdateQuery(
            'user_contract_metrics',
            ['id'],
            contractMetricUpdates.map((metric) => ({
              id: metric.id,
              profit: metric.profit,
            })) as any[]
          )
        )
      }
      if (perpPeriodUpdates.length > 0) {
        queries.push(
          bulkUpdateDataQuery('user_contract_metrics', perpPeriodUpdates)
        )
      }
      await pg
        .multi(queries.join(';\n'))
        .catch((e) => log.error('Error updating contract metrics', e))
        .then(() =>
          log('Finished updating user period metrics.', {
            totalUpdates,
          })
        )
    }
  }
  log('Finished running user metrics period update')
  return { metricsByUser, contractsById }
}

const getContractIdsWithRecentMetricActivity = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number,
  perpSince: number
) => {
  const contractIds = await pg.map(
    `
    select distinct contract_id
    from (
      select cb.contract_id
      from contract_bets cb
      where cb.user_id in ($1:list)
        and cb.created_time > $2

      union

      select e.contract_id
      from contract_perp_events e
      where e.user_id in ($1:list)
        and e.applied_ts > $3
    ) recent_activity
    `,
    [userIds, new Date(since).toISOString(), new Date(perpSince).toISOString()],
    (r) => r.contract_id as string
  )

  return contractIds
}

const getContractMetricsWithoutRecentActivity = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number,
  contractIdsWithRecentActivity: string[]
) => {
  const excludeClause =
    contractIdsWithRecentActivity.length > 0
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
    [userIds, new Date(since).toISOString(), contractIdsWithRecentActivity],
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
