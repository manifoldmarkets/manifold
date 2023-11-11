import { CPMMMultiContract } from 'common/contract'

export const getCumulativeRelationshipProb = (
  contract: CPMMMultiContract,
  index: number
) => {
  const { answers } = contract
  return answers
    .slice(0, index + 1)
    .map((a) => a.resolution === "YES"? 1:a.prob)
    .reduce((a, b) => a * b, 1)
}
