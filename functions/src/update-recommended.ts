import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Query } from 'firebase-admin/firestore'
import { uniq } from 'lodash'

import { createSupabaseClient, invokeFunction, loadPaginated } from './utils'
import { newEndpointNoAuth } from './api'
import { getMarketRecommendations } from '../../common/recommendation'
import { run } from '../../common/supabase/utils'
import { mapAsync } from '../../common/util/promise'

const firestore = admin.firestore()

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

export const updaterecommended = newEndpointNoAuth(
  { timeoutSeconds: 3600, memory: '8GiB', minInstances: 0 },
  async (_req) => {
    await updateRecommendedMarkets()
    return { success: true }
  }
)

export const updateRecommendedMarkets = async () => {
  console.log('Loading user data...')
  const userData = await loadUserData()

  console.log('Computing recommendations...')

  const { userIds, userFeatures, contractIds, contractFeatures } =
    getMarketRecommendations(userData, 3000)

  const userFeatureRows = userFeatures.map((features, i) => ({
    user_id: userIds[i],
    f0: features[0],
    f1: features[1],
    f2: features[2],
    f3: features[3],
    f4: features[4],
  }))
  const contractFeatureRows = contractFeatures.map((features, i) => ({
    contract_id: contractIds[i],
    f0: features[0],
    f1: features[1],
    f2: features[2],
    f3: features[3],
    f4: features[4],
  }))

  console.log('Writing recommendations to Supabase...')

  const db = createSupabaseClient()
  await run(db.from('user_recommendation_features').upsert(userFeatureRows))
  await run(
    db.from('contract_recommendation_features').upsert(contractFeatureRows)
  )

  console.log('Done.')
}

const loadUserData = async () => {
  const userIds = (
    await loadPaginated(
      firestore.collection('users').select('id') as Query<{ id: string }>
    )
  ).map(({ id }) => id)

  console.log('Loaded', userIds.length, 'users')

  return await mapAsync(userIds, async (userId) => {
    const betOnIds = (
      await loadPaginated(
        firestore
          .collection('users')
          .doc(userId)
          .collection('contract-metrics')
          .select('contractId') as Query<{ contractId: string }>
      )
    ).map(({ contractId }) => contractId)

    const swipedIds = uniq(
      (
        await loadPaginated(
          admin
            .firestore()
            .collection('private-users')
            .doc(userId)
            .collection('seenMarkets')
            .select('id') as Query<{ id: string }>
        )
      ).map(({ id }) => id)
    )

    const viewedCardIds = uniq(
      (
        await loadPaginated(
          firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market card')
            .select('contractId') as Query<{ contractId: string }>
        )
      ).map(({ contractId }) => contractId)
    )

    const viewedPageIds = uniq(
      (
        await loadPaginated(
          firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market')
            .select('contractId') as Query<{ contractId: string }>
        )
      ).map(({ contractId }) => contractId)
    )

    const likedIds = uniq(
      (
        await loadPaginated(
          admin
            .firestore()
            .collection('users')
            .doc(userId)
            .collection('reactions')
            .where('contentType', '==', 'contract')
            .select('contentId') as Query<{ contentId: string }>
        )
      ).map(({ contentId }) => contentId)
    )

    return {
      userId,
      betOnIds,
      swipedIds,
      viewedCardIds,
      viewedPageIds,
      likedIds,
    }
  })
}
