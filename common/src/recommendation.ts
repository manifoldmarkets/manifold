import { shuffle, uniq } from 'lodash'
import { Contract } from './contract'
import { factorizeMatrix } from './util/matrix'

export type user_data = {
  userId: string
  betOnIds: string[]
  viewedCardIds: string[]
  viewedPageIds: string[]
  likedIds: string[]
  groupIds: string[]
}

export const LATENT_FEATURES_COUNT = 5
const DESTINY_GROUP_ID = 'W2ES30fRo6CCbPNwMTTj'

export function getMarketRecommendations(
  contracts: Contract[],
  userData: user_data[],
  iterations = 2000
) {
  const userIds = userData.map(({ userId }) => userId)
  const userIdToIndex = Object.fromEntries(userIds.map((id, i) => [id, i]))

  const groupsToContracts: {
    [groupId: string]: { [contractId: string]: true }
  } = {}
  for (const contract of contracts) {
    const groupIds = contract.groupLinks?.map((g) => g.groupId) ?? []
    for (const groupId of groupIds) {
      if (!groupsToContracts[groupId]) {
        groupsToContracts[groupId] = {}
      }
      groupsToContracts[groupId][contract.id] = true
    }
  }
  const destinyContractIds = Object.keys(
    groupsToContracts[DESTINY_GROUP_ID] ?? {}
  )

  const contractIds: string[] = []
  const contractIdToIndex: { [contractId: string]: number } = {}
  const getColumnIndex = (contractId: string) => {
    let idx = contractIdToIndex[contractId]
    if (idx == null) {
      idx = contractIdToIndex[contractId] = contractIds.length
      contractIds.push(contractId)
    }
    return idx
  }

  // Sparse matrix of users x contracts.
  const rows = userData.map((data) => {
    const { viewedCardIds, viewedPageIds, betOnIds, likedIds, groupIds } = data

    const row: Map<number, number> = new Map()
    const viewedCards = uniq(viewedCardIds)
    const yourViewedContractsSet = new Set(viewedCards.concat(viewedPageIds))
    const likedOrBetOnIds = uniq([...likedIds, ...betOnIds])

    for (const contractId of viewedCards) {
      // If you viewed it but didn't take any action, that's evidence you're not interested.
      row.set(getColumnIndex(contractId), 0)
    }
    if (!groupIds.includes(DESTINY_GROUP_ID)) {
      // Downweight markets in the Destiny group if you don't follow it.
      const contractIdSubset = shuffle(destinyContractIds).slice(0, 25)
      for (const contractId of contractIdSubset) {
        row.set(getColumnIndex(contractId), 0)
      }
    }
    for (const contractId of viewedPageIds) {
      // If you clicked into a market, that demonstrates interest.
      row.set(getColumnIndex(contractId), 0.25)
    }
    for (const groupId of groupIds) {
      // If you follow a group, count that as interest in random subset of group markets.
      const contractIds = Object.keys(groupsToContracts[groupId] ?? {})
      const contractIdSubset = shuffle(contractIds).slice(0, 5)
      for (const contractId of contractIdSubset) {
        row.set(getColumnIndex(contractId), 1)
      }
    }
    for (const contractId of likedOrBetOnIds) {
      // Don't include contracts bet on before we recorded views.
      // If there are no views, then algorithm can just predict 1 always.
      if (yourViewedContractsSet.has(contractId)) {
        // Predicting these bets and likes is the goal!
        row.set(getColumnIndex(contractId), 1)
      }
    }
    return row
  })

  // Fill in a few random 0's for each user and contract column.
  // When users click a link directly to a market or search for it,
  // and bet on it, then we start to get only 1's in the matrix,
  // which is bad for the algorithm to distinguish between good and bad contracts:
  // it will just predict 1 for all contracts.
  for (const row of rows) {
    for (let i = 0; i < 20; i++) {
      const column = Math.floor(Math.random() * contractIds.length)
      if (!row.has(column)) row.set(column, 0)
    }
  }
  for (let column = 0; column < contractIds.length; column++) {
    for (let i = 0; i < 10; i++) {
      const row = rows[Math.floor(Math.random() * rows.length)]
      if (!row.has(column)) row.set(column, 0)
    }
  }

  const sparseMatrix = rows.map((m) => Array.from(m.entries()))
  const [userFeatures, contractFeatures, getScore] = factorizeMatrix(
    sparseMatrix,
    LATENT_FEATURES_COUNT,
    iterations
  )

  // Compute scores per user one at a time to save memory.
  const getUserContractScores = (userId: string) => {
    const userIndex = userIdToIndex[userId]
    if (!userIndex) return {}

    const contractScorePairs = contractIds.map((contractId, contractIndex) => {
      // Get current approximation as dot product of latent features
      return [contractId, getScore(userIndex, contractIndex)] as const
    })

    return Object.fromEntries(contractScorePairs)
  }

  return {
    userIds,
    userFeatures,
    contractIds,
    contractFeatures,
    getUserContractScores,
  }
}
