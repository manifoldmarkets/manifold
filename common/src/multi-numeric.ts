import { CPMMNumericContract } from 'common/contract'
import { filterDefined } from 'common/util/array'
import { find, findLast, mean, sum } from 'lodash'
import {
  getAnswerProbability,
  getInitialAnswerProbability,
} from 'common/calculate'

export const getMultiNumericAnswerMidpoints = (
  contract: CPMMNumericContract
) => {
  return contract.answers.map((a) => mean(getMultiNumericAnswerToRange(a.text)))
}

export const getNumericBucketSize = (
  min: number,
  max: number,
  buckets: number
) => (max - min) / buckets

export const getDecimalPlaces = (min: number, max: number, buckets: number) =>
  getNumericBucketSize(min, max, buckets) > 10 / buckets
    ? 0
    : Math.max(
        0,
        Math.ceil(Math.abs(Math.log10(getNumericBucketSize(min, max, buckets))))
      )

export const getMultiNumericAnswerBucketRanges = (
  min: number,
  max: number,
  buckets: number
) => {
  const rangeSize = max - min
  if (rangeSize === 0 || isNaN(buckets)) {
    return [[min, max]]
  }
  const stepSize = rangeSize / buckets
  const decimalPlaces = getDecimalPlaces(min, max, buckets)

  const ranges: [number, number][] = []
  for (let i = 0; i < buckets; i++) {
    const bucketStart = Number((min + i * stepSize).toFixed(decimalPlaces))
    const bucketEnd = Number((min + (i + 1) * stepSize).toFixed(decimalPlaces))
    ranges.push([bucketStart, bucketEnd])
  }

  return ranges
}

export const getMultiNumericAnswerBucketRangeNames = (
  min: number,
  max: number,
  buckets: number
) => {
  const ranges = getMultiNumericAnswerBucketRanges(min, max, buckets)
  return ranges.map(([min, max]) => `${min}-${max}`)
}

export const getMultiNumericAnswerToRange = (originalAnswerText: string) => {
  const answerText = originalAnswerText.trim()
  const regex = /[-+]?\d+(\.\d+)?/g
  const matches = answerText.match(regex)
  if (!matches || matches.length !== 2) {
    console.error('Invalid numeric answer text', answerText)
    return [0, 0]
  }
  const dashCount = answerText.split('-').length - 1
  const min =
    dashCount === 1 ? Math.abs(parseFloat(matches[0])) : parseFloat(matches[0])
  const max =
    dashCount === 1 ? Math.abs(parseFloat(matches[1])) : parseFloat(matches[1])

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
  const answerValues = answers.map((a) =>
    mean(getMultiNumericAnswerToRange(a.text))
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
  const { answers, min, max } = contract
  // There are a few NaN & undefined values on dev
  if (isNaN(value) || min === undefined || max === undefined || max === min)
    return 'N/A'
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: getDecimalPlaces(min, max, answers.length),
  })
  return formatter.format(value).replace('$', '')
}

export const getRangeContainingValue = (
  value: number,
  answerTexts: string[],
  min: number,
  max: number
) => {
  const buckets = answerTexts.map((a) => getMultiNumericAnswerToRange(a))
  const containingBucket = find(buckets, (bucket) => {
    const [start, end] = bucket
    return value >= start && value <= end
  })

  if (containingBucket) return containingBucket as [number, number]

  const bucketBelow = findLast(buckets, (bucket) => {
    const [, end] = bucket
    return value > end
  })
  const bucketAbove = find(buckets, (bucket) => {
    const [start] = bucket
    return value < start
  })

  return [bucketBelow?.[0] ?? min, bucketAbove?.[1] ?? max] as [number, number]
}

export const getRangeContainingValues = (
  values: number[],
  answerTexts: string[],
  min: number,
  max: number
) => {
  const ranges = values.map((amount) =>
    getRangeContainingValue(amount, answerTexts, min, max)
  )
  const overallMin = Math.min(...ranges.map((r) => r[0]))
  const overallMax = Math.max(...ranges.map((r) => r[1]))
  return [overallMin, overallMax] as [number, number]
}
