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

const firestore = admin.firestore()

export const updateRecommendations = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const contracts = await getValues<Contract>(
      firestore.collection('contracts')
    )

    const users = await getValues<User>(firestore.collection('users'))

    await batchedWaitAll(
      users.map((user) => () => updateWordScores(user, contracts))
    )
  })

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
