import { DAY_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getUsers, log } from 'shared/utils'
import { groupBy, sortBy, sumBy, uniq } from 'lodash'
import { Contract, CPMMMultiContract } from 'common/contract'
import { calculateMetricsByContractAndAnswer } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { buildArray } from 'common/util/array'
import { hasSignificantDeepChanges } from 'common/util/object'
import { Bet } from 'common/bet'
import { getAnswersForContractsDirect } from 'shared/supabase/answers'
import { convertBet } from 'common/supabase/bets'
import { ContractMetric } from 'common/contract-metric'

// NOTE: This function is just a script and isn't used regularly
export async function updateUserMetricsWithBets(
  userIds?: string[],
  since?: number
) {
  const useSince = since !== undefined
  const now = Date.now()
  const weekAgo = now - DAY_MS * 7
  const pg = createSupabaseDirectClient()

  log('Loading active users...')
  const activeUserIds = userIds?.length
    ? userIds
    : await pg.map(
        `select distinct user_id from contract_bets`,
        [],
        (r) => r.user_id as string
      )

  log(`Loaded ${activeUserIds.length} active users.`)

  log('Loading bets...')

  // We need to update metrics for contracts that resolved up through a week ago,
  // so we can calculate the daily/weekly profit on them
  const metricRelevantBets = await getUnresolvedOrRecentlyResolvedBets(
    pg,
    activeUserIds,
    useSince ? since : weekAgo
  )
  log(
    `Loaded ${sumBy(
      Object.values(metricRelevantBets),
      (bets) => bets.length
    )} bets.`
  )

  log('Loading contracts...')
  const allBets = Object.values(metricRelevantBets).flat()
  const contracts = await getRelevantContracts(pg, allBets)
  log('Loading answers...')
  const answersByContractId = await getAnswersForContractsDirect(
    pg,
    contracts.filter((c) => c.mechanism === 'cpmm-multi-1').map((c) => c.id)
  )
  log(`Loaded ${contracts.length} contracts and their answers.`)

  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))

  for (const [contractId, answers] of Object.entries(answersByContractId)) {
    // Denormalize answers onto the contract.
    // eslint-disable-next-line no-extra-semi
    ;(contractsById[contractId] as CPMMMultiContract).answers = answers
  }

  log('Loading current contract metrics...')
  const currentContractMetrics = await pg.map(
    `select data from user_contract_metrics
            where user_id in ($1:list)
            and contract_id in ($2:list)
            `,
    [activeUserIds, contracts.map((c) => c.id)],
    (r) => r.data as ContractMetric
  )
  log(`Loaded ${currentContractMetrics.length} current contract metrics.`)

  const currentMetricsByUserId = groupBy(
    currentContractMetrics,
    (m) => m.userId
  )

  const contractMetricUpdates = []

  log('Loading user balances & deposit information...')
  // Load user data right before calculating metrics to avoid out-of-date deposit/balance data (esp. for new users that
  // get their first 9 deposits upon visiting new markets).
  const users = await getUsers(activeUserIds)
  log('Computing metric updates...')
  for (const user of users) {
    const userMetricRelevantBets = metricRelevantBets[user.id] ?? []
    const metricRelevantBetsByContract = groupBy(
      userMetricRelevantBets,
      (b) => b.contractId
    )
    const currentMetricsForUser = currentMetricsByUserId[user.id] ?? []
    const freshMetrics = calculateMetricsByContractAndAnswer(
      metricRelevantBetsByContract,
      contractsById,
      user.id,
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

  log('Writing updates and inserts...')
  await Promise.all(
    buildArray(
      contractMetricUpdates.length > 0 &&
        bulkUpdateContractMetrics(contractMetricUpdates)
          .catch((e) => log.error('Error upserting contract metrics', e))
          .then(() => log('Finished updating contract metrics.'))
    )
  )

  // await revalidateStaticProps('/leaderboards')

  log('Done.')
}

const getRelevantContracts = async (pg: SupabaseDirectClient, bets: Bet[]) => {
  const betContractIds = uniq(bets.map((b) => b.contractId))
  return await pg.map(
    `select data from contracts where id in ($1:list)`,
    [betContractIds],
    (r) => r.data as Contract
  )
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
