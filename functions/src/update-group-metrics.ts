import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sumBy, mapValues } from 'lodash'

import { getValues, log, writeAsync } from './utils'
import { Contract } from '../../common/contract'
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
      const creatorScores = scoreCreators(groupContracts)
      const traderScores = await scoreTraders(groupContracts)

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

function scoreCreators(contracts: Contract[]) {
  const creatorScore = mapValues(
    groupBy(contracts, ({ creatorId }) => creatorId),
    (contracts) =>
      sumBy(
        contracts.map((contract) => {
          return contract.volume
        })
      )
  )

  return creatorScore
}

async function scoreTraders(contracts: Contract[]) {
  const userScoresByContract = await batchedWaitAll(
    contracts.map((c) => () => scoreUsersByContract(c))
  )
  const userScores: { [userId: string]: number } = {}
  for (const scores of userScoresByContract) {
    addUserScores(scores, userScores)
  }
  return userScores
}

async function scoreUsersByContract(contract: Contract) {
  const userContractMetrics = await firestore
    .collectionGroup('contract-metrics')
    .where('contractId', '==', contract.id)
    .select('profit')
    .get()
  return Object.fromEntries(
    userContractMetrics.docs.map((d) => {
      const userId = d.ref.path.split('/')[1] // users/foo/contract-metrics/bar
      const profit = d.get('profit')
      return [userId, profit]
    })
  )
}

function addUserScores(
  src: { [userId: string]: number },
  dest: { [userId: string]: number }
) {
  for (const [userId, score] of Object.entries(src)) {
    if (dest[userId] === undefined) dest[userId] = 0
    dest[userId] += score
  }
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
