import { buildCompletedMatrix, factorizeMatrix } from './util/matrix'

export type user_data = {
  userId: string
  betOnIds: string[]
  swipedIds: string[]
  viewedCardIds: string[]
  viewedPageIds: string[]
  likedIds: string[]
}

export async function getMarketRecommendations(userData: user_data[]) {
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

    for (const contractId of swipedIds) {
      sparseMatrix[userIndex][contractId] = 0
      columnSet.add(contractId)
    }
    for (const contractId of viewedCardIds) {
      sparseMatrix[userIndex][contractId] = 0
      columnSet.add(contractId)
    }
    for (const contractId of viewedPageIds) {
      sparseMatrix[userIndex][contractId] = 0.1
      columnSet.add(contractId)
    }
    for (const contractId of betOnIds) {
      sparseMatrix[userIndex][contractId] = 0.5
      columnSet.add(contractId)
    }
    for (const contractId of likedIds) {
      sparseMatrix[userIndex][contractId] = 1
      columnSet.add(contractId)
    }
  }

  const columns = Array.from(columnSet)
  const [f1, f2] = factorizeMatrix(sparseMatrix, columns, 8)
  const recsMatrix = buildCompletedMatrix(f1, f2)
  const getUserContractScores = (userId: string) => {
    const userIndex = userIdToIndex[userId]
    const userScores = recsMatrix[userIndex]
    return Object.fromEntries(userScores.map((v, i) => [columns[i], v]))
  }
  return getUserContractScores
}
