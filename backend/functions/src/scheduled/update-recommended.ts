import * as functions from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import { groupBy } from 'lodash'

import { invokeFunction } from 'shared/utils'
import {
  LATENT_FEATURES_COUNT,
  getQuestionRecommendations,
} from 'common/recommendation'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getAll, bulkUpsert } from 'shared/supabase/utils'

export const scheduleUpdateRecommended = functions.pubsub
  // Run every hour.
  .schedule('0 * * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updaterecommended'))
    } catch (e) {
      console.error(e)
    }
  })

export const updaterecommended = onRequest(
  { timeoutSeconds: 3600, cpu: 4, memory: '2GiB', minInstances: 0 },
  async (_req, res) => {
    await updateRecommendedQuestions()
    res.status(200).json({ success: true })
  }
)

export const updateRecommendedQuestions = async () => {
  const pg = createSupabaseDirectClient()

  console.log('Loading contracts...')
  const contracts = await getAll(pg, 'contracts')

  console.log('Loading user data...')
  const userData = await loadUserDataForRecommendations(pg)

  console.log('Computing recommendations...')

  const { userIds, userFeatures, contractIds, contractFeatures } =
    getQuestionRecommendations(contracts, userData, 2000)

  const userFeatureRows = userIds.map((userId, i) => ({
    user_id: userId,
    f0: userFeatures[i * LATENT_FEATURES_COUNT + 0],
    f1: userFeatures[i * LATENT_FEATURES_COUNT + 1],
    f2: userFeatures[i * LATENT_FEATURES_COUNT + 2],
    f3: userFeatures[i * LATENT_FEATURES_COUNT + 3],
    f4: userFeatures[i * LATENT_FEATURES_COUNT + 4],
  }))
  const contractFeatureRows = contractIds.map((contractId, i) => ({
    contract_id: contractId,
    f0: contractFeatures[i * LATENT_FEATURES_COUNT + 0],
    f1: contractFeatures[i * LATENT_FEATURES_COUNT + 1],
    f2: contractFeatures[i * LATENT_FEATURES_COUNT + 2],
    f3: contractFeatures[i * LATENT_FEATURES_COUNT + 3],
    f4: contractFeatures[i * LATENT_FEATURES_COUNT + 4],
  }))

  console.log('Writing recommendations to Supabase...')

  await bulkUpsert(
    pg,
    'user_recommendation_features',
    'user_id',
    userFeatureRows
  )
  await bulkUpsert(
    pg,
    'contract_recommendation_features',
    'contract_id',
    contractFeatureRows
  )
  console.log('Done.')
}

export const loadUserDataForRecommendations = async (
  pg: SupabaseDirectClient
) => {
  const uids = await pg.map('select id from users', [], (r) => r.id as string)
  console.log('Querying', uids.length, 'users')

  const betOnIds = Object.fromEntries(
    await pg.map(
      `select user_id, array_agg(contract_id) as contract_ids
       from user_contract_metrics
       group by user_id`,
      [],
      (r) => [r.user_id as string, r.contract_ids as string[]]
    )
  )

  const viewedIds = await pg.manyOrNone(
    `select
      user_id, type as event_name,
      array_agg(distinct contract_id) as contract_ids
    from user_seen_markets
    group by user_id, type`
  )
  const viewedIdsByEvent = groupBy(viewedIds, (r) => r.event_name)
  const viewedCardIds = Object.fromEntries(
    viewedIdsByEvent['view question card'].map((r) => [
      r.user_id as string,
      r.contract_ids as string[],
    ])
  )
  const viewedPageIds = Object.fromEntries(
    viewedIdsByEvent['view question'].map((r) => [
      r.user_id as string,
      r.contract_ids as string[],
    ])
  )

  const likedIds = Object.fromEntries(
    await pg.map(
      `select user_id, array_agg(distinct data->>'contentId') as contract_ids
      from user_reactions
      where data->>'contentType' = 'contract'
      group by user_id`,
      [],
      (r) => [r.user_id as string, r.contract_ids as string[]]
    )
  )

  const groupIds = Object.fromEntries(
    await pg.map(
      `select member_id, array_agg(group_id) as group_ids
      from group_members
      group by member_id`,
      [],
      (r) => [r.member_id as string, r.group_ids as string[]]
    )
  )

  return uids.map((userId) => ({
    userId,
    betOnIds: betOnIds[userId] ?? [],
    viewedCardIds: viewedCardIds[userId] ?? [],
    viewedPageIds: viewedPageIds[userId] ?? [],
    likedIds: likedIds[userId] ?? [],
    groupIds: groupIds[userId] ?? [],
  }))
}
