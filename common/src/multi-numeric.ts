import {
  CPMMNumericContract,
  MULTI_NUMERIC_BUCKETS_COUNT,
} from 'common/contract'

export const getMultiNumericAnswerMidpoints = (max: number, min: number) => {
  const bucketWidth = getNumericBucketWidth({ max, min } as CPMMNumericContract)

  return Array.from(
    { length: MULTI_NUMERIC_BUCKETS_COUNT },
    (_, i) => min + i * bucketWidth + bucketWidth / 2
  )
}
export const getNumericBucketWidth = (contract: CPMMNumericContract) =>
  (contract.max - contract.min) / MULTI_NUMERIC_BUCKETS_COUNT

export const getMultiNumericAnswerBucketRanges = (
  contract: CPMMNumericContract
) => {
  const bucketWidth = getNumericBucketWidth(contract)
  const { min } = contract
  return Array.from({ length: MULTI_NUMERIC_BUCKETS_COUNT }, (_, i) => [
    min + i * bucketWidth,
    min + (i + 1) * bucketWidth,
  ])
}
