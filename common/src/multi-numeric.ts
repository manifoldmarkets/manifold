import {
  CPMMNumericContract,
  MULTI_NUMERIC_BUCKETS_COUNT,
} from 'common/contract'
import { formatLargeNumber } from 'common/util/format'
import { filterDefined } from 'common/util/array'
import { sum } from 'lodash'
import {
  getAnswerProbability,
  getInitialAnswerProbability,
} from 'common/calculate'

const epsilon = 0.000001
export const getMultiNumericAnswerMidpoints = (min: number, max: number) => {
  const buckets = getMultiNumericAnswerBucketRanges(min, max)
  return buckets.map(([min, max]) => (max + min) / 2)
}
const roundToEpsilon = (num: number) =>
  Number((Math.round(num / epsilon) * epsilon).toFixed(10))

export const getNumericBucketSize = (contract: CPMMNumericContract) =>
  (contract.max - contract.min + 1) / MULTI_NUMERIC_BUCKETS_COUNT

export const getMultiNumericAnswerBucketRanges = (min: number, max: number) => {
  const bucketSize = getNumericBucketSize({ max, min } as CPMMNumericContract)

  return Array.from({ length: MULTI_NUMERIC_BUCKETS_COUNT }, (_, i) => [
    roundToEpsilon(min + i * bucketSize),
    i === MULTI_NUMERIC_BUCKETS_COUNT
      ? max
      : roundToEpsilon(min - 1 + (i + 1) * bucketSize),
  ])
}

export const getMultiNumericAnswerBucketRangeNames = (
  min: number,
  max: number
) => {
  const ranges = getMultiNumericAnswerBucketRanges(min, max)
  return ranges.map(
    ([min, max]) => `${formatLargeNumber(min)}-${formatLargeNumber(max)}`
  )
}

export const getMultiNumericAnswerToRange = (answerText: string) => {
  const [min, max] = answerText.split('-').map(parseFloat)
  return [min, max]
}

export const getMultiNumericAnswerToMidpoint = (answerText: string) => {
  const [min, max] = getMultiNumericAnswerToRange(answerText)
  return (max + min) / 2
}

export function getExpectedValue(
  contract: CPMMNumericContract,
  initialOnly?: boolean
) {
  const { answers } = contract

  const answerProbabilities = filterDefined(
    answers.map((a) =>
      initialOnly
        ? getInitialAnswerProbability(contract, a)
        : getAnswerProbability(contract, a.id)
    )
  )
  const answerValues = getMultiNumericAnswerMidpoints(
    contract.min,
    contract.max
  )
  return sum(answerProbabilities.map((p, i) => p * answerValues[i]))
}
