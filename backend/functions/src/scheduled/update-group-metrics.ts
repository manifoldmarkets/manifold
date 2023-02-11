import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sumBy, mapValues, uniq } from 'lodash'

import { log } from 'shared/utils'
import { Contract } from 'common/contract'
import { mapAsync } from 'common/util/promise'
import { newEndpointNoAuth } from '../api/api'
import { invokeFunction } from 'shared/utils'
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
  const groups = await firestore.collection('groups').select().get()
  log(`Loaded ${groups.size} groups.`)

  log('Loading group-contract associations...')
  const groupContractDocs = await firestore
    .collectionGroup('groupContracts')
    .get()
  const contractIdsByGroupId = mapValues(
    groupBy(
      groupContractDocs.docs,
      (d) => d.ref.path.split('/')[1] // groups/foo/groupContracts/bar
    ),
    (ds) => ds.map((d) => d.get('contractId') as string)
  )
  log(`Loaded ${groupContractDocs.size} associations.`)

  log('Loading contracts...')
  const contractIds = uniq(
    groupContractDocs.docs.map((d) => d.get('contractId') as string)
  )
  const contractsById = Object.fromEntries(
    (await loadContracts(contractIds)).map((c) => [c.id, c])
  )
  log(`Loaded ${contractIds.length} contracts.`)

  log('Computing metric updates...')
  const writer = firestore.bulkWriter()
  await mapAsync(groups.docs, async (doc) => {
    const contractIds = contractIdsByGroupId[doc.id] ?? []
    const contracts = contractIds.map((c) => contractsById[c])
    const creatorScores = scoreCreators(contracts)
    const traderScores = await scoreTraders(contractIds)
    const topTraderScores = topUserScores(traderScores)
    const topCreatorScores = topUserScores(creatorScores)
    writer.update(doc.ref, {
      cachedLeaderboard: {
        topTraders: topTraderScores,
        topCreators: topCreatorScores,
      },
    })
  })

  log('Committing writes...')
  await writer.close()
  log('Done.')
}

function scoreCreators(contracts: Contract[]) {
  if (contracts.length === 0) {
    return {}
  }
  const creatorScore = mapValues(
    groupBy(contracts, ({ creatorId }) => creatorId),
    (contracts) =>
      sumBy(
        contracts.map((contract) => {
          return contract?.uniqueBettorCount ?? 0
        })
      )
  )

  return creatorScore
}

async function scoreTraders(contractIds: string[]) {
  if (contractIds.length === 0) {
    return {}
  }
  const userScoresByContract = await mapAsync(contractIds, (c) =>
    scoreUsersByContract(c)
  )
  const userScores: { [userId: string]: number } = {}
  for (const scores of userScoresByContract) {
    addUserScores(scores, userScores)
  }
  return userScores
}

async function scoreUsersByContract(contractId: string) {
  const userContractMetrics = await firestore
    .collectionGroup('contract-metrics')
    .where('contractId', '==', contractId)
    .select('profit')
    .get()
  return Object.fromEntries(
    userContractMetrics.docs.map((d) => {
      const userId = d.ref.path.split('/')[1] // users/foo/contract-metrics/bar
      const profit = d.get('profit') as number
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

async function loadContracts(contractIds: string[]) {
  const refs = contractIds.map((c) => firestore.collection('contracts').doc(c))
  const contractDocs = await firestore.getAll(...refs)
  return contractDocs.map((d) => d.data() as Contract)
}
