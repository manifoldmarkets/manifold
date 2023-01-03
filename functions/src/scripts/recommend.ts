import { getMarketRecommendations, user_data } from 'common/recommendation'
import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { mapAsync } from 'common/util/promise'
import * as admin from 'firebase-admin'
import { CollectionReference, Query } from 'firebase-admin/firestore'
import { sortBy, uniq } from 'lodash'
import { readJson, writeJson } from '../helpers/file'
import { createSupabaseClient, getContract, loadPaginated } from '../utils'

import { initAdmin } from './script-init'
initAdmin()
const firestore = admin.firestore()
const db = createSupabaseClient()

const loadUserData = async () => {
  const users = await loadPaginated(
    firestore.collection('users') as CollectionReference<User>
  )

  console.log('Loaded', users.length, 'users')

  return await mapAsync(users, async (user, i) => {
    console.log(user.id, i)
    const userId = user.id

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
            .doc(user.id)
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

const recommend = async () => {
  console.log('Recommend script')

  let userData = await readJson<user_data[]>('user-data3.json')

  if (userData) {
    console.log('Loaded view data from file.')
  } else {
    console.log('Loading view data from Firestore...')
    userData = await loadUserData()
    await writeJson('user-data3.json', userData)
  }

  console.log('Computing recommendations...')
  const {
    userIds,
    contractIds,
    userFeatures,
    contractFeatures,
    getUserContractScores,
  } = await getMarketRecommendations(userData)

  const userFeatureRows = userFeatures.map((features, i) => ({
    user_id: userIds[i],
    f0: features[0],
    f1: features[1],
    f2: features[2],
    f3: features[3],
    f4: features[4],
  }))

  await run(
    db.from('user_recommendation_features').upsert(userFeatureRows)
  ).catch((e) => console.log('supabase error', e))

  const contractFeatureRows = contractFeatures.map((features, i) => ({
    contract_id: contractIds[i],
    f0: features[0],
    f1: features[1],
    f2: features[2],
    f3: features[3],
    f4: features[4],
  }))

  await run(
    db.from('contract_recommendation_features').upsert(contractFeatureRows)
  ).catch((e) => console.log('supabase error', e))

  await debug(getUserContractScores)
}

async function debug(
  getUserContractScores: (userId: string) => { [k: string]: number }
) {
  console.log('Destiny user scores')
  await printUserScores('PKj937RvUZYUbnG7IU8sVPN7XYr1', getUserContractScores)

  console.log('Bembo scores')
  await printUserScores('G3S3nhcGWhPU3WEtlUYbAH4tv7f1', getUserContractScores)

  console.log('Stephen scores')
  await printUserScores('tlmGNz9kjXc2EteizMORes4qvWl2', getUserContractScores)

  console.log('James scores')
  const jamesId = '5LZ4LgYuySdL1huCWe7bti02ghx2'
  await printUserScores(jamesId, getUserContractScores)
}

async function printUserScores(
  userId: string,
  getUserContractScores: (userId: string) => { [k: string]: number }
) {
  const userScores = getUserContractScores(userId)
  const sortedScores = sortBy(Object.entries(userScores), ([, score]) => -score)
  console.log(
    'top scores',
    sortedScores.slice(0, 20),
    (
      await Promise.all(
        sortedScores.slice(0, 20).map(([contractId]) => getContract(contractId))
      )
    ).map((c) => c?.question)
  )

  console.log(
    'bottom scores',
    sortedScores.slice(sortedScores.length - 20),
    (
      await Promise.all(
        sortedScores
          .slice(sortedScores.length - 20)
          .map(([contractId]) => getContract(contractId))
      )
    ).map((c) => c?.question)
  )
}

if (require.main === module) {
  recommend().then(() => process.exit())
}
