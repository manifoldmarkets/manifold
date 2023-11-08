import { CPMMMultiContract } from 'common/contract'

export const getSixMonthProb = (contract: CPMMMultiContract) => {
  const { answers } = contract
  return answers
    .slice(0, 4)
    .map((a) => a.prob)
    .reduce((a, b) => a * b, 1)
}
