import { map, sum, zipWith } from 'lodash'

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

function magnitude(vec: number[]) {
  return Math.sqrt(sum(map(vec, (val) => val * val)))
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
  return dotProduct(vecA, vecB) / (magnitude(vecA) * magnitude(vecB))
}

export function cosineDistance(vecA: number[], vecB: number[]) {
  return 1 - cosineSimilarity(vecA, vecB)
}
