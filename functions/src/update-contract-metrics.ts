import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getValues, invokeFunction, log } from './utils'
import { Bet, LimitBet } from '../../common/bet'
import { Contract, CPMM } from '../../common/contract'
import { DAY_MS } from '../../common/util/time'
import {
  calculateProbChange,
  computeElasticity,
  computeVolume,
} from '../../common/calculate-metrics'
import { getProbability } from '../../common/calculate'
import { batchedWaitAll } from '../../common/util/promise'
import { hasChanges } from '../../common/util/object'
import { newEndpointNoAuth } from './api'

const firestore = admin.firestore()
export const scheduleUpdateContractMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updatecontractmetrics'))
    } catch (e) {
      console.error(e)
    }
  })

export const updatecontractmetrics = newEndpointNoAuth(
  { timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 },
  async (_req) => {
    await updateContractMetrics()
    return { success: true }
  }
)

export async function updateContractMetrics() {
  log('Loading contracts...')
  const contracts = await getValues<Contract>(firestore.collection('contracts'))
  log(`Loaded ${contracts.length} contracts.`)

  log('Computing metric updates...')
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const monthAgo = now - 30 * DAY_MS

  const writer = firestore.bulkWriter({ throttling: false })
  await batchedWaitAll(
    contracts.map((contract) => async () => {
      const descendingBets = await getValues<Bet>(
        firestore
          .collection('contracts')
          .doc(contract.id)
          .collection('bets')
          .orderBy('createdTime', 'desc')
          .where('createdTime', '>=', monthAgo)
      )
      const unfilledBets = await getValues<LimitBet>(
        firestore
          .collection('contracts')
          .doc(contract.id)
          .collection('bets')
          .where('limitProb', '>', 0)
          .where('isFilled', '==', false)
          .where('isCancelled', '==', false)
      )

      let cpmmFields: Partial<CPMM> = {}
      if (contract.mechanism === 'cpmm-1') {
        let prob = descendingBets[0]
          ? descendingBets[0].probAfter
          : getProbability(contract)

        const { resolution, resolutionProbability, resolutionTime } = contract
        if (resolution === 'YES') prob = 1
        else if (resolution === 'NO') prob = 0
        else if (resolution === 'MKT' && resolutionProbability !== undefined)
          prob = resolutionProbability

        const probChanges = {
          day: calculateProbChange(
            prob,
            descendingBets,
            yesterday,
            resolutionTime
          ),
          week: calculateProbChange(
            prob,
            descendingBets,
            weekAgo,
            resolutionTime
          ),
          month: calculateProbChange(
            prob,
            descendingBets,
            monthAgo,
            resolutionTime
          ),
        }
        cpmmFields = { prob, probChanges }
      }

      const uniqueBettors24Hours = getUniqueBettors(
        descendingBets.filter((bet) => bet.createdTime > yesterday)
      )
      const uniqueBettors7Days = getUniqueBettors(
        descendingBets.filter((bet) => bet.createdTime > weekAgo)
      )
      const uniqueBettors30Days = getUniqueBettors(
        descendingBets.filter((bet) => bet.createdTime > monthAgo)
      )

      const update = {
        volume24Hours: computeVolume(descendingBets, yesterday),
        volume7Days: computeVolume(descendingBets, weekAgo),
        elasticity: computeElasticity(unfilledBets, contract),
        uniqueBettors24Hours,
        uniqueBettors7Days,
        uniqueBettors30Days,
        ...cpmmFields,
      }
      if (hasChanges(contract, update)) {
        const contractDoc = firestore.collection('contracts').doc(contract.id)
        writer.update(contractDoc, update)
      }
    }),
    100
  )

  log('Committing writes...')
  await writer.close()
  log('Done.')
}

function getUniqueBettors(bets: Bet[]) {
  const userIds = new Set<string>()
  bets.forEach((bet) => userIds.add(bet.userId))
  return userIds.size
}
