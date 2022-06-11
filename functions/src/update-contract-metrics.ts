import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { max, sumBy } from 'lodash'

import { getValues, log, logMemory } from './utils'
import { Bet } from '../../common/bet'
import { batchedWaitAll } from '../../common/util/promise'

const firestore = admin.firestore()

const oneDay = 1000 * 60 * 60 * 24

const computeVolumes = async (contractId: string, durationsMs: number[]) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const longestDurationMs = max(durationsMs)!
  const allBets = await getValues<Bet>(
    firestore
      .collection(`contracts/${contractId}/bets`)
      .where('createdTime', '>', Date.now() - longestDurationMs)
  )
  return durationsMs.map((duration) => {
    const cutoff = Date.now() - duration
    const bets = allBets.filter((b) => b.createdTime > cutoff)
    return sumBy(bets, (bet) => (bet.isRedemption ? 0 : Math.abs(bet.amount)))
  })
}

export const updateContractMetricsCore = async () => {
  const contractDocs = await firestore.collection('contracts').listDocuments()
  log(`Loaded ${contractDocs.length} contract IDs.`)
  logMemory()
  await batchedWaitAll(
    contractDocs.map((doc) => async () => {
      const [volume24Hours, volume7Days] = await computeVolumes(doc.id, [
        oneDay,
        oneDay * 7,
      ])
      return doc.update({
        volume24Hours,
        volume7Days,
      })
    })
  )
  log(`Updated metrics for ${contractDocs.length} contracts.`)
}

export const updateContractMetrics = functions
  .runWith({ memory: '1GB' })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateContractMetricsCore)
