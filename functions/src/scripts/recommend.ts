import { Contract } from 'common/contract'
import { getMarketRecommendations } from 'common/recommendation'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { asyncMap } from 'common/util/promise'
import * as admin from 'firebase-admin'
import { CollectionReference, Query } from 'firebase-admin/firestore'
import { writeCsv, readCsv } from '../helpers/csv'
import { loadPaginated } from '../utils'

import { initAdmin } from './script-init'
initAdmin()
const firestore = admin.firestore()

const loadBetPairs = async () => {
  const contractUniqueBettorIds = await loadPaginated(
    admin
      .firestore()
      .collection('contracts')
      .select('id', 'uniqueBettorIds') as Query<
      Pick<Contract, 'id' | 'uniqueBettorIds'>
    >
  )
  const betPairs = filterDefined(
    contractUniqueBettorIds.map(({ id: contractId, uniqueBettorIds }) =>
      uniqueBettorIds?.map((userId) => ({
        userId,
        contractId,
      }))
    )
  ).flat()

  return betPairs
}

const loadViewPairs = async () => {
  const users = await loadPaginated(
    firestore.collection('users') as CollectionReference<User>
  )
  const viewPairsUnflattened = await asyncMap(users, async (user) => {
    const userId = user.id
    const contractIds = await loadPaginated(
      admin
        .firestore()
        .collection('users')
        .doc(user.id)
        .collection('seenMarkets')
        .select('id') as Query<{ id: string }>
    )
    return contractIds.map(({ id: contractId }) => ({ userId, contractId }))
  })
  const viewPairs = viewPairsUnflattened.flat()
  return viewPairs
}

const recommend = async () => {
  console.log('Recommend script')

  let betPairs = await readCsv<{ userId: string; contractId: string }>(
    'bet-pairs.csv'
  )

  if (betPairs) {
    console.log('Loaded bet data from file.')
  } else {
    console.log('Loading bet data from Firestore...')
    betPairs = await loadBetPairs()
    await writeCsv('bet-pairs.csv', ['userId', 'contractId'], betPairs)
  }

  let viewPairs = await readCsv<{ userId: string; contractId: string }>(
    'view-pairs.csv'
  )

  if (viewPairs) {
    console.log('Loaded view data from file.')
  } else {
    console.log('Loading view data from Firestore...')
    viewPairs = await loadViewPairs()
    await writeCsv('view-pairs.csv', ['userId', 'contractId'], viewPairs)
  }

  console.log('Computing recommendations...')
  const matrix = await getMarketRecommendations(betPairs, viewPairs)
  console.log('result', matrix)
}

if (require.main === module) {
  recommend().then(() => process.exit())
}
