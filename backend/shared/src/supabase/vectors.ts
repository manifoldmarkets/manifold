import { sum, zipWith } from 'lodash'

export const userInterestEmbeddings: Record<
  string,
  {
    interest: number[]
    disinterest: number[] | null
    lastBetTime: number | null
    createdTime: number
  }
> = {}

function dotProduct(vecA: number[], vecB: number[]) {
  return sum(zipWith(vecA, vecB, (a, b) => a * b))
}

function unitVectorCosineSimilarity(vecA: number[], vecB: number[]) {
  return dotProduct(vecA, vecB)
}

export function unitVectorCosineDistance(vecA: number[], vecB: number[]) {
  return 1 - unitVectorCosineSimilarity(vecA, vecB)
}
