import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sortBy } from 'lodash'

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

  log('Loading bets...')
  const bets = await loadContractBets(contracts.map((c) => c.id))
  log(`Loaded ${bets.length} bets.`)

  log('Computing metric updates...')

  const now = Date.now()
  const betsByContract = groupBy(bets, (bet) => bet.contractId)
  const contractUpdates = contracts
    .filter((contract) => contract.id)
    .map((contract) => {
      const contractBets = betsByContract[contract.id] ?? []
      const descendingBets = sortBy(
        contractBets,
        (bet) => bet.createdTime
      ).reverse()

      let cpmmFields: Partial<CPMM> = {}
      if (contract.mechanism === 'cpmm-1') {
        const prob = descendingBets[0]
          ? descendingBets[0].probAfter
          : getProbability(contract)

        cpmmFields = {
          prob,
          probChanges: calculateProbChanges(descendingBets),
        }
      }

      return {
        doc: firestore.collection('contracts').doc(contract.id),
        fields: {
          volume24Hours: computeVolume(contractBets, now - DAY_MS),
          volume7Days: computeVolume(contractBets, now - DAY_MS * 7),
          elasticity: computeElasticity(contractBets, contract),
          ...cpmmFields,
        },
      }
    })

  log('Writing contract metric updates...')
  await writeAsync(firestore, contractUpdates)
}

async function loadContractBets(contractIds: string[]) {
  return (
    await batchedWaitAll(
      contractIds.map(
        (c) => () =>
          getValues<Bet>(
            firestore.collection('contracts').doc(c).collection('bets')
          )
      ),
      100
    )
  ).flat()
}
