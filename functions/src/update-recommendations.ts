import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { getValue, getValues } from './utils'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import { User } from '../../common/user'
import { ClickEvent } from '../../common/tracking'
import { getWordScores } from '../../common/recommended-contracts'
import { batchedWaitAll } from '../../common/util/promise'
import { callCloudFunction } from './call-cloud-function'

const firestore = admin.firestore()

export const updateRecommendations = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const users = await getValues<User>(firestore.collection('users'))

    const batchSize = 100
    const userBatches: User[][] = []
    for (let i = 0; i < users.length; i += batchSize) {
      userBatches.push(users.slice(i, i + batchSize))
    }

    await Promise.all(
      userBatches.map((batch) =>
        callCloudFunction('updateRecommendationsBatch', { users: batch })
      )
    )
  })

export const updateRecommendationsBatch = functions.https.onCall(
  async (data: { users: User[] }) => {
    const { users } = data

    const contracts = await getValues<Contract>(
      firestore.collection('contracts')
    )

    await batchedWaitAll(
      users.map((user) => () => updateWordScores(user, contracts))
    )
  }
)

export const updateWordScores = async (user: User, contracts: Contract[]) => {
  const [bets, viewCounts, clicks] = await Promise.all([
    getValues<Bet>(
      firestore.collectionGroup('bets').where('userId', '==', user.id)
    ),

    getValue<{ [contractId: string]: number }>(
      firestore.doc(`private-users/${user.id}/cache/viewCounts`)
    ),

    getValues<ClickEvent>(
      firestore
        .collection(`private-users/${user.id}/events`)
        .where('type', '==', 'click')
    ),
  ])

  const wordScores = getWordScores(contracts, viewCounts ?? {}, clicks, bets)

  const cachedCollection = firestore.collection(
    `private-users/${user.id}/cache`
  )
  await cachedCollection.doc('wordScores').set(wordScores)
}
