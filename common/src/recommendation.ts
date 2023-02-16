import { uniq } from 'lodash'
import { Contract } from './contract'
import { dotProduct, factorizeMatrix } from './util/matrix'
import { chooseRandomSubset } from './util/random'

export type user_data = {
  userId: string
  betOnIds: string[]
  swipedIds: string[]
  viewedCardIds: string[]
  viewedPageIds: string[]
  likedIds: string[]
  groupIds: string[]
}

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

  // Sparse matrix of users x contracts.
  const sparseMatrix = userIds.map(
    () => ({} as { [contractId: string]: number })
  )
  const contractIdSet = new Set<string>()

  for (const {
    userId,
    swipedIds,
    viewedCardIds,
    viewedPageIds,
    betOnIds,
    likedIds,
    groupIds,
  } of userData) {
    const userIndex = userIdToIndex[userId]

    const viewedCardsOrSwipes = uniq([...viewedCardIds, ...swipedIds])
    const likedOrBetOnIds = uniq([...likedIds, ...betOnIds])

    for (const contractId of viewedCardsOrSwipes) {
      // If you viewed it but didn't take any action, that's evidence you're not interested.
      sparseMatrix[userIndex][contractId] = 0
      contractIdSet.add(contractId)
    }
    if (!groupIds.includes(DESTINY_GROUP_ID)) {
      // Downweight markets in the Destiny group if you don't follow it.
      const contractIds = Object.keys(groupsToContracts[DESTINY_GROUP_ID] ?? {})
      const contractIdSubset = chooseRandomSubset(contractIds, 25)
      for (const contractId of contractIdSubset) {
        sparseMatrix[userIndex][contractId] = 0
        contractIdSet.add(contractId)
      }
    }
    for (const contractId of viewedPageIds) {
      // If you clicked into a market, that demonstrates interest.
      sparseMatrix[userIndex][contractId] = 0.25
      contractIdSet.add(contractId)
    }
    for (const groupId of groupIds) {
      // If you follow a group, count that as interest in random subset of group markets.
      const contractIds = Object.keys(groupsToContracts[groupId] ?? {})
      const contractIdSubset = chooseRandomSubset(contractIds, 5)
      for (const contractId of contractIdSubset) {
        sparseMatrix[userIndex][contractId] = 1
        contractIdSet.add(contractId)
      }
    }
    for (const contractId of likedOrBetOnIds) {
      // Don't include contracts bet on before we recorded views.
      // If there are no views, then algorithm can just predict 1 always.
      if (contractIdSet.has(contractId)) {
        // Predicting these bets and likes is the goal!
        sparseMatrix[userIndex][contractId] = 1
      }
    }
  }

  const contractIds = Array.from(contractIdSet)
  console.log('rows', sparseMatrix.length, 'columns', contractIds.length)

  // Fill in a few random 0's for each user and contract column.
  // When users click a link directly to a market or search for it,
  // and bet on it, then we start to get only 1's in the matrix,
  // which is bad for the algorithm to distinguish between good and bad contracts:
  // it will just predict 1 for all contracts.
  for (const row of sparseMatrix) {
    for (let i = 0; i < 20; i++) {
      const randContractId =
        contractIds[Math.floor(Math.random() * contractIds.length)]
      if (row[randContractId] === undefined) row[randContractId] = 0
    }
  }
  for (const contractId of contractIds) {
    for (let i = 0; i < 10; i++) {
      const randUser = Math.floor(Math.random() * sparseMatrix.length)
      if (sparseMatrix[randUser][contractId] === undefined)
        sparseMatrix[randUser][contractId] = 0
    }
  }

  const [userFeatures, contractFeatures] = factorizeMatrix(
    sparseMatrix,
    contractIds,
    5,
    iterations
  )

  const contractIdToIndex = Object.fromEntries(
    contractIds.map((column, i) => [column, i] as const)
  )

  // Compute scores per user one at a time to save memory.
  const getUserContractScores = (userId: string) => {
    const userIndex = userIdToIndex[userId]
    if (!userIndex) return {}

    const contractScorePairs = contractIds.map((contractId) => {
      const contractIndex = contractIdToIndex[contractId]
      const score = dotProduct(
        userFeatures[userIndex],
        contractFeatures[contractIndex]
      )
      return [contractId, score] as const
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
