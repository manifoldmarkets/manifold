import {
  CPMMNumericContract,
  MULTI_NUMERIC_BUCKETS_COUNT,
} from 'common/contract'
import { formatLargeNumber } from 'common/util/format'

const epsilon = 0.000001
export const getMultiNumericAnswerMidpoints = (min: number, max: number) => {
  const bucketWidth = getNumericBucketWidth({ max, min } as CPMMNumericContract)
  return Array.from({ length: MULTI_NUMERIC_BUCKETS_COUNT }, (_, i) =>
    Number(
      (
        Math.round((min + i * bucketWidth + bucketWidth / 2) / epsilon) *
        epsilon
      ).toFixed(10)
    )
  )
}

export const getNumericBucketWidth = (contract: CPMMNumericContract) =>
  (contract.max - contract.min) / MULTI_NUMERIC_BUCKETS_COUNT

export const getMultiNumericAnswerBucketRanges = (min: number, max: number) => {
  const bucketWidth = getNumericBucketWidth({ max, min } as CPMMNumericContract)

  return Array.from({ length: MULTI_NUMERIC_BUCKETS_COUNT }, (_, i) => [
    min + i * bucketWidth,
    min + (i + 1) * bucketWidth,
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
