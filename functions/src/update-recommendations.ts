import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { getValue, getValues } from './utils'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import { User } from '../../common/user'
import { ClickEvent } from '../../common/tracking'
import {
  getContractScores,
  getWordScores,
} from '../../common/recommended-contracts'

const firestore = admin.firestore()

export const updateRecommendations = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const contracts = await getValues<Contract>(
      firestore.collection('contracts')
    )

    const users = await getValues<User>(firestore.collection('users'))

    for (const user of users) await updateUserRecommendations(user, contracts)
  })

export const updateUserRecommendations = async (
  user: User,
  contracts: Contract[]
) => {
  const [bets, viewCounts, clicks] = await Promise.all([
    getValues<Bet>(
      firestore.collectionGroup('bets').where('userId', '==', user.id)
    ),

    getValue<{ [contractId: string]: number }>(
      firestore.doc(`private-users/${user.id}/cached/viewCounts`)
    ),

    getValues<ClickEvent>(
      firestore
        .collection(`private-users/${user.id}/events`)
        .where('type', '==', 'click')
    ),
  ])

  const wordScores = getWordScores(contracts, viewCounts ?? {}, clicks, bets)
  const contractScores = getContractScores(contracts, wordScores)

  const cachedCollection = firestore.collection(
    `private-users/${user.id}/cached`
  )
  await cachedCollection.doc('wordScores').set(wordScores)
  await cachedCollection.doc('contractScores').set(contractScores)
}
