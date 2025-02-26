import { sum } from 'lodash'
import { getAnswerProbability } from './calculate'
import { filterDefined } from './util/array'
import { getInitialAnswerProbability } from './calculate'
import { MultiNumericContract } from './contract'
export const MAX_MULTI_NUMERIC_ANSWERS = 12

export function getExpectedValue(
  contract: MultiNumericContract,
  initialOnly?: boolean
) {
  const { answers, shouldAnswersSumToOne } = contract

  const answerProbabilities = filterDefined(
    answers.map((a) =>
      initialOnly
        ? getInitialAnswerProbability(contract, a)
        : getAnswerProbability(contract, a.id)
    )
  )
  const answerMidpoints = answers.map((a) => a.midpoint!)
  if (shouldAnswersSumToOne) {
    return sum(answerProbabilities.map((p, i) => p * answerMidpoints[i]))
  }
  return sum(
    answerMidpoints.map((midpoint, i) =>
      i === answerProbabilities.length - 1
        ? midpoint * answerProbabilities[i]
        : midpoint * (answerProbabilities[i] - answerProbabilities[i + 1])
    )
  )
}

export const getMinMax = (contract: MultiNumericContract) => {
  const { answers } = contract
  const min = Math.min(...answers.map((a) => a.midpoint!))
  const max = Math.max(...answers.map((a) => a.midpoint!))
  return { min, max }
}

export const isTimeUnit = (unit: string) => {
  const units = ['year', 'month', 'day', 'week', 'hour', 'minute', 'second']
  const plurals = units.map((u) => u + 's')
  return units.includes(unit) || plurals.includes(unit)
}

export function formatExpectedValue(
  value: number,
  contract: MultiNumericContract,
  includeUnit = true
) {
  const { answers, unit } = contract
  const { min, max } = getMinMax(contract)
  // There are a few NaN & undefined values on dev
  if (isNaN(value) || min === undefined || max === undefined || max === min)
    return 'N/A'
  if (answers.length == 0) return '' // probably from static props
  if (isTimeUnit(unit)) {
    const now = Date.now()
    return new Date(now + value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: max - min < 10 ? 2 : max - min < 100 ? 1 : 0,
  })
  return (
    formatter.format(value).replace('$', '') +
    (includeUnit ? ' ' + (unit ?? '') : '')
  )
}

export function getFormattedExpectedValue(
  contract: MultiNumericContract,
  includeUnit = true
) {
  return formatExpectedValue(getExpectedValue(contract), contract, includeUnit)
}
