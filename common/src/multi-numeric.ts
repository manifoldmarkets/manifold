import {
  CPMMNumericContract,
  MULTI_NUMERIC_BUCKETS_COUNT,
} from 'common/contract'
import { filterDefined } from 'common/util/array'
import { sum } from 'lodash'
import {
  getAnswerProbability,
  getInitialAnswerProbability,
} from 'common/calculate'

export const getMultiNumericAnswerMidpoints = (min: number, max: number) => {
  const buckets = getMultiNumericAnswerBucketRanges(min, max)
  return buckets.map(([min, max]) => (max + min) / 2)
}
export const getNumericBucketSize = (contract: { max: number; min: number }) =>
  (contract.max - contract.min) / MULTI_NUMERIC_BUCKETS_COUNT

export const getDecimalPlaces = (contract: { max: number; min: number }) =>
  Math.max(0, Math.ceil(-Math.log10(getNumericBucketSize(contract))))

export const getMultiNumericAnswerBucketRanges = (min: number, max: number) => {
  const rangeSize = max - min
  if (rangeSize === 0) {
    return [[min, max]]
  }
  const stepSize = rangeSize / MULTI_NUMERIC_BUCKETS_COUNT
  const decimalPlaces = getDecimalPlaces({ min, max })

  const buckets: [number, number][] = []
  for (let i = 0; i < MULTI_NUMERIC_BUCKETS_COUNT; i++) {
    const bucketStart = Number((min + i * stepSize).toFixed(decimalPlaces))
    const bucketEnd = Number((min + (i + 1) * stepSize).toFixed(decimalPlaces))
    buckets.push([bucketStart, bucketEnd])
  }

  return buckets
}

export const getMultiNumericAnswerBucketRangeNames = (
  min: number,
  max: number
) => {
  const ranges = getMultiNumericAnswerBucketRanges(min, max)
  return ranges.map(([min, max]) => `${min}-${max}`)
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

export function getFormattedExpectedValue(contract: CPMMNumericContract) {
  return formatExpectedValue(getExpectedValue(contract), contract)
}

export function formatExpectedValue(
  value: number,
  contract: CPMMNumericContract
) {
  // There are a few NaN values on dev
  if (isNaN(value)) return 'N/A'
  return value.toFixed(getDecimalPlaces(contract))
}
