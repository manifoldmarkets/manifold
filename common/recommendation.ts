import { isArray, uniq } from 'lodash'
import { dotProduct, factorizeMatrix } from './util/matrix'

export type user_data = {
  userId: string
  betOnIds: string[]
  swipedIds: string[]
  viewedCardIds: string[]
  viewedPageIds: string[]
  likedIds: string[]
}

export async function getMarketRecommendations(userData: user_data[]) {
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

  const [f1, f2] = factorizeMatrix(sparseMatrix, columns, 5, 50)

  // Compute scores per user one at a time to save memory.
  const getUserContractScores = (userId: string) => {
    const userIndex = userIdToIndex[userId]
    if (!userIndex) return {}

    const userFeatures = f1[userIndex]

    const contractScorePairs = columns
      .map((column, i) => {
        const columnFeatures = f2[i]
        const score = dotProduct(userFeatures, columnFeatures)
        return [column, score] as const
      })
      .filter(([column]) => column.startsWith('swiped-'))
      .map(([column, value]) => [column.replace('swiped-', ''), value])

    return Object.fromEntries(contractScorePairs)
  }

  return { getUserContractScores, userIds }
}
