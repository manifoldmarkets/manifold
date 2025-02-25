import { sum } from 'lodash'
import { getAnswerProbability } from './calculate'
import { filterDefined } from './util/array'
import { getInitialAnswerProbability } from './calculate'
import { MultiNumericContract } from './contract'
import { getDecimalPlaces } from './number'

export function getExpectedValue(
  contract: MultiNumericContract,
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
  const answerValues = answers.map((a) => a.midpoint!)

  return sum(answerProbabilities.map((p, i) => p * answerValues[i]))
}

export function formatExpectedValue(
  value: number,
  contract: MultiNumericContract
) {
  const { answers, unit } = contract
  const min = Math.min(...answers.map((a) => a.midpoint!))
  const max = Math.max(...answers.map((a) => a.midpoint!))
  // There are a few NaN & undefined values on dev
  if (isNaN(value) || min === undefined || max === undefined || max === min)
    return 'N/A'
  if (answers.length == 0) return '' // probably from static props
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: getDecimalPlaces(min, max, answers.length),
  })
  return formatter.format(value).replace('$', '') + ' ' + (unit ?? '')
}
