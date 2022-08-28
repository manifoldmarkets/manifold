import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { getValues, log, writeAsync } from '../utils'
import { Bet } from '../../../common/bet'
import { groupBy, mapValues, sortBy, uniq } from 'lodash'

initAdmin()
const firestore = admin.firestore()

const getBettorsByContractId = async () => {
  const bets = await getValues<Bet>(firestore.collectionGroup('bets'))
  log(`Loaded ${bets.length} bets.`)
  const betsByContractId = groupBy(bets, 'contractId')
  return mapValues(betsByContractId, (bets) =>
    uniq(sortBy(bets, 'createdTime').map((bet) => bet.userId))
  )
}

const updateUniqueBettors = async () => {
  const bettorsByContractId = await getBettorsByContractId()

  const updates = Object.entries(bettorsByContractId).map(
    ([contractId, userIds]) => {
      const update = {
        uniqueBettorIds: userIds,
        uniqueBettorCount: userIds.length,
      }
      const docRef = firestore.collection('contracts').doc(contractId)
      return { doc: docRef, fields: update }
    }
  )
  log(`Updating ${updates.length} contracts.`)
  await writeAsync(firestore, updates)
  log(`Updated all contracts.`)
}

if (require.main === module) {
  updateUniqueBettors()
}
