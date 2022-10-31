import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy } from 'lodash'

import { getValues, log, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { scoreTraders, scoreCreators } from '../../common/scoring'
import { Group, GroupContractDoc } from '../../common/group'
import { batchedWaitAll } from '../../common/util/promise'
import { newEndpointNoAuth } from './api'
import { invokeFunction } from './utils'
const firestore = admin.firestore()

export const scheduleUpdateGroupMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updategroupmetrics'))
    } catch (e) {
      console.error(e)
    }
  })

export const updategroupmetrics = newEndpointNoAuth(
  { timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 },
  async (_req) => {
    await updateGroupMetrics()
    return { success: true }
  }
)

export async function updateGroupMetrics() {
  log('Loading groups...')
  const groups = await getValues<Group>(firestore.collection('groups'))
  log(`Loaded ${groups.length} groups.`)
  log('Computing metric updates...')
  const groupUpdates = await batchedWaitAll(
    groups.map((group) => async () => {
      const groupContracts = await loadGroupContracts(group.id)
      const groupBets = await loadContractBets(groupContracts.map((c) => c.id))
      const betsByContract = groupBy(groupBets, (bet) => bet.contractId)
      const bets = groupContracts.map((e) => betsByContract[e.id] ?? [])

      const creatorScores = scoreCreators(groupContracts)
      const traderScores = scoreTraders(groupContracts, bets)

      const topTraderScores = topUserScores(traderScores)
      const topCreatorScores = topUserScores(creatorScores)

      return {
        doc: firestore.collection('groups').doc(group.id),
        fields: {
          cachedLeaderboard: {
            topTraders: topTraderScores,
            topCreators: topCreatorScores,
          },
        },
      }
    }),
    100
  )
  log('Writing metric updates...')
  await writeAsync(firestore, groupUpdates)
}

const topUserScores = (scores: { [userId: string]: number }) => {
  const top50 = Object.entries(scores)
    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
    .slice(0, 50)
  return top50.map(([userId, score]) => ({ userId, score }))
}

async function loadGroupContracts(groupId: string) {
  const groupContractDocs = (
    await firestore
      .collection('groups')
      .doc(groupId)
      .collection('groupContracts')
      .get()
  ).docs.map((d) => d.data() as GroupContractDoc)
  if (groupContractDocs.length === 0) {
    return []
  } else {
    const groupContractIds = groupContractDocs.map((g) => g.contractId)
    const groupContractRefs = groupContractIds.map((c) =>
      firestore.collection('contracts').doc(c)
    )
    const contractDocs = await firestore.getAll(...groupContractRefs)
    return contractDocs.map((d) => d.data() as Contract)
  }
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
