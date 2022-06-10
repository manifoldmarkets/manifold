import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { max, sumBy } from 'lodash'

import { getValues } from './utils'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import { batchedWaitAll } from '../../common/util/promise'

const firestore = admin.firestore()

const oneDay = 1000 * 60 * 60 * 24

export const updateContractMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const contracts = await getValues<Contract>(
      firestore.collection('contracts')
    )

    await batchedWaitAll(
      contracts.map((contract) => async () => {
        const [volume24Hours, volume7Days] = await computeVolumes(contract, [
          oneDay,
          oneDay * 7,
        ])
        const contractRef = firestore.doc(`contracts/${contract.id}`)
        return contractRef.update({
          volume24Hours,
          volume7Days,
        })
      })
    )
  })

const computeVolumes = async (contract: Contract, durationsMs: number[]) => {
  const longestDurationMs = max(durationsMs)
  /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
  const allBets = await getValues<Bet>(
    firestore
      .collection(`contracts/${contract.id}/bets`)
      .where('createdTime', '>', Date.now() - longestDurationMs!)
  )

  return durationsMs.map((duration) => {
    const cutoff = Date.now() - duration
    const bets = allBets.filter((b) => b.createdTime > cutoff)
    return sumBy(bets, (bet) => (bet.isRedemption ? 0 : Math.abs(bet.amount)))
  })
}
