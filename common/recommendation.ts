import { isArray, uniq, zip } from 'lodash'
import { dotProduct, factorizeMatrix } from './util/matrix'

export type user_data = {
  userId: string
  betOnIds: string[]
  swipedIds: string[]
  viewedCardIds: string[]
  viewedPageIds: string[]
  likedIds: string[]
}

export function getMarketRecommendations(
  userData: user_data[],
  iterations = 5000
) {
  userData = userData.filter((userData) =>
    Object.values(userData).some((obj) => isArray(obj) && obj.length > 0)
  )
  const userIds = userData.map(({ userId }) => userId)
  const userIdToIndex = Object.fromEntries(userIds.map((id, i) => [id, i]))

  const sparseMatrix = userIds.map(() => ({} as { [column: string]: number }))
  const columnSet = new Set<string>()

  for (const {
    userId,
    swipedIds,
    viewedCardIds,
    viewedPageIds,
    betOnIds,
    likedIds,
  } of userData) {
    const userIndex = userIdToIndex[userId]

    const likedOrBetOnIds = uniq([...likedIds, ...betOnIds])

    for (const contractId of viewedCardIds) {
      sparseMatrix[userIndex][contractId] = 0
      columnSet.add(contractId)
    }
    for (const contractId of viewedPageIds) {
      sparseMatrix[userIndex][contractId] = 0.25
      columnSet.add(contractId)
    }
    for (const contractId of likedOrBetOnIds) {
      // Don't include contracts bet on before we recorded views.
      // If there are no views, then algorithm can just predict 1 always.
      if (columnSet.has(contractId)) {
        sparseMatrix[userIndex][contractId] = 1
      }
    }

    // Add new columns for swiped contracts.
    for (const contractId of swipedIds) {
      sparseMatrix[userIndex]['swiped-' + contractId] = 0
      columnSet.add('swiped-' + contractId)
    }
    for (const contractId of likedOrBetOnIds) {
      if (columnSet.has('swiped-' + contractId)) {
        sparseMatrix[userIndex]['swiped-' + contractId] = 1
      }
    }
  }

  const columns = Array.from(columnSet)
  console.log('rows', sparseMatrix.length, 'columns', columns.length)

  // Fill in a few random 0's for each user and contract.
  // When users click a link directly to a market or search for it,
  // and bet on it, then we start to get only 1's in the matrix,
  // which is bad for the algorithm to distinguish between good and bad contracts:
  // it will just predict 1 for all contracts.
  const contractColumns = Array.from(columnSet).filter(
    (column) => !column.startsWith('swiped-')
  )
  for (const row of sparseMatrix) {
    for (let i = 0; i < 10; i++) {
      const randColumn =
        contractColumns[Math.floor(Math.random() * contractColumns.length)]
      if (row[randColumn] === undefined) row[randColumn] = 0
    }
  }
  for (const column of contractColumns) {
    for (let i = 0; i < 10; i++) {
      const randUser = Math.floor(Math.random() * sparseMatrix.length)
      if (sparseMatrix[randUser][column] === undefined)
        sparseMatrix[randUser][column] = 0
    }
  }

  const [userFeatures, contractFeatures] = factorizeMatrix(
    sparseMatrix,
    columns,
    5,
    iterations
  )

  const swipeColumnIndices = columns
    .map((column, i) => [column, i] as const)
    .filter(([column]) => column.startsWith('swiped-'))
    .map(([_, i]) => i)
  const swipeContractFeatures = swipeColumnIndices.map(
    (i) => contractFeatures[i]
  )
  const swipeContractIds = swipeColumnIndices.map((i) =>
    columns[i].replace('swiped-', '')
  )
  const swipeContractToFeatures = Object.fromEntries(
    zip(swipeContractIds, swipeContractFeatures) as [string, number[]][]
  )

  // Compute scores per user one at a time to save memory.
  const getUserContractScores = (userId: string) => {
    const userIndex = userIdToIndex[userId]
    if (!userIndex) return {}

    const contractScorePairs = swipeContractIds.map((contractId) => {
      const score = dotProduct(
        userFeatures[userIndex],
        swipeContractToFeatures[contractId]
      )
      return [contractId, score] as const
    })

    return Object.fromEntries(contractScorePairs)
  }

  return {
    userIds,
    userFeatures,
    contractIds: swipeContractIds,
    contractFeatures: swipeContractFeatures,
    getUserContractScores,
  }
}
