import { DAY_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { chunk, groupBy, sortBy, sumBy, uniq } from 'lodash'
import { calculateMetricsByContractAndAnswer } from 'common/calculate-metrics'
import { hasSignificantDeepChanges } from 'common/util/object'
import { convertBet } from 'common/supabase/bets'
import { ContractMetric } from 'common/contract-metric'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { buildArray } from 'common/util/array'
import { getContractsDirect } from './supabase/contracts'

export async function updateUserMetricsWithBets(
  userIds?: string[],
  since?: number
) {
  const useSince = since !== undefined
  const now = Date.now()
  const weekAgo = now - DAY_MS * 7
  const pg = createSupabaseDirectClient()

  log('Loading active users...')
  const allActiveUserIds = userIds?.length
    ? userIds
    : await pg.map(
        `select distinct user_id from contract_bets`,
        [],
        (r) => r.user_id as string
      )

  log(`Loaded ${allActiveUserIds.length} active users.`)

  let userIdsToProcess = allActiveUserIds
  const allUsersToRetry: string[] = []

  while (userIdsToProcess.length > 0) {
    const userBatches = chunk(userIdsToProcess, 100)
    for (const userBatch of userBatches) {
      const betLoadTime = Date.now()
      log('Loading bets...')

      // We need to update metrics for contracts that resolved up through a week ago,
      // so we can calculate the daily/weekly profit on them
      const metricRelevantBets = await getUnresolvedOrRecentlyResolvedBets(
        pg,
        userBatch,
        useSince ? since : weekAgo
      )
      log(
        `Loaded ${sumBy(
          Object.values(metricRelevantBets),
          (bets) => bets.length
        )} bets for ${userBatch.length} users.`
      )

      log('Loading contracts...')
      const allBets = Object.values(metricRelevantBets).flat()
      const betContractIds = uniq(allBets.map((b) => b.contractId))
      const [contracts, currentContractMetrics] = await Promise.all([
        getContractsDirect(betContractIds, pg),
        pg.map(
          `select data from user_contract_metrics
          where user_id in ($1:list)
          and contract_id in ($2:list)
          `,
          [userBatch, betContractIds],
          (r) => r.data as ContractMetric
        ),
      ])
      const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))
      log(`Loaded ${contracts.length} contracts and their answers.`)
      log(`Loaded ${currentContractMetrics.length} current contract metrics.`)

      const currentMetricsByUserId = groupBy(
        currentContractMetrics,
        (m) => m.userId
      )

      const contractMetricUpdates: ContractMetric[] = []

      log('Computing metric updates...')
      for (const userId of userBatch) {
        const userMetricRelevantBets = metricRelevantBets[userId] ?? []
        const metricRelevantBetsByContract = groupBy(
          userMetricRelevantBets,
          (b) => b.contractId
        )
        const currentMetricsForUser = currentMetricsByUserId[userId] ?? []
        const freshMetrics = calculateMetricsByContractAndAnswer(
          metricRelevantBetsByContract,
          contractsById,
          userId,
          currentMetricsForUser
        )
        contractMetricUpdates.push(
          ...freshMetrics.filter((freshMetric) => {
            const currentMetric = currentMetricsForUser.find(
              (m) =>
                freshMetric.contractId === m.contractId &&
                freshMetric.answerId === m.answerId
            )
            if (!currentMetric) return true
            return hasSignificantDeepChanges(currentMetric, freshMetric, 0.1)
          })
        )
      }
      log(`Computed ${contractMetricUpdates.length} metric updates.`)
      const userIdsWithUpdates = uniq(
        contractMetricUpdates.map((m) => m.userId)
      )
      const justBetUserIds = await pg.map(
        `select distinct user_id from contract_bets where user_id in ($1:list) and created_time >= $2`,
        [userIdsWithUpdates, new Date(betLoadTime).toISOString()],
        (r) => r.user_id as string
      )

      if (justBetUserIds.length > 0) {
        log(
          `Found ${justBetUserIds.length} users with new bets. Retrying them later.`
        )
        allUsersToRetry.push(...justBetUserIds)
      }

      const updatesToWrite = contractMetricUpdates.filter(
        (m) => !justBetUserIds.includes(m.userId)
      )

      log(`Writing ${updatesToWrite.length} updates and inserts...`)
      await Promise.all(
        buildArray(
          updatesToWrite.length > 0 &&
            bulkUpdateContractMetrics(updatesToWrite)
              .catch((e) => log.error('Error upserting contract metrics', e))
              .then(() => log('Finished updating contract metrics.'))
        )
      )
    }
    userIdsToProcess = uniq(allUsersToRetry)
    allUsersToRetry.length = 0
  }
  log('Done.')
}

const getUnresolvedOrRecentlyResolvedBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number
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
    `,
    [userIds, new Date(since).toISOString()],
    convertBet
  )

  return groupBy(
    sortBy(bets, (b) => b.createdTime),
    (r) => r.userId as string
  )
}
