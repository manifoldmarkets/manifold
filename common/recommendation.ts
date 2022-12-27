import { uniq } from 'lodash'
import { buildCompletedMatrix, factorizeMatrix } from './util/matrix'

export async function getMarketRecommendations(
  betPairs: { userId: string; contractId: string }[]
) {
  const userIds = uniq(betPairs.map((p) => p.userId))
  const userIdToIndex = Object.fromEntries(userIds.map((id, i) => [id, i]))

  const sparseMatrix = userIds.map(() => ({} as { [column: string]: number }))
  const columnSet = new Set<string>()

  for (const { userId, contractId } of betPairs) {
    const userIndex = userIdToIndex[userId]
    sparseMatrix[userIndex][contractId] = 1

    columnSet.add(contractId)
  }

  const columns = Array.from(columnSet)
  const [f1, f2] = factorizeMatrix(sparseMatrix, columns, 12)
  const result = buildCompletedMatrix([f1, f2])
  return result
}
