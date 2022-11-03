import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getValues, invokeFunction, log, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract, CPMM } from '../../common/contract'
import { DAY_MS } from '../../common/util/time'
import {
  calculateProbChanges,
  computeElasticity,
  computeVolume,
} from '../../common/calculate-metrics'
import { getProbability } from '../../common/calculate'
import { batchedWaitAll } from '../../common/util/promise'
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
  const contractUpdates = await batchedWaitAll(
    contracts.map((contract) => async () => {
      const descendingBets = await getValues<Bet>(
        firestore
          .collection('contracts')
          .doc(contract.id)
          .collection('bets')
          .orderBy('createdTime', 'desc')
      )

      let cpmmFields: Partial<CPMM> = {}
      if (contract.mechanism === 'cpmm-1') {
        let prob = descendingBets[0]
          ? descendingBets[0].probAfter
          : getProbability(contract)

        const { resolution, resolutionProbability } = contract
        if (resolutionProbability) {
          prob = resolutionProbability
        } else if (resolution && resolution !== 'CANCEL') {
          prob = resolution === 'YES' ? 1 : 0
        }

        cpmmFields = {
          prob,
          probChanges: calculateProbChanges(prob, descendingBets),
        }
      }

      return {
        doc: firestore.collection('contracts').doc(contract.id),
        fields: {
          volume24Hours: computeVolume(descendingBets, now - DAY_MS),
          volume7Days: computeVolume(descendingBets, now - DAY_MS * 7),
          elasticity: computeElasticity(descendingBets, contract),
          ...cpmmFields,
        },
      }
    }),
    100
  )

  log('Writing contract metric updates...')
  await writeAsync(firestore, contractUpdates)
}
