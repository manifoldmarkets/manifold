import { sum } from 'lodash'
import { getAnswerProbability } from './calculate'
import { filterDefined } from './util/array'
import { getInitialAnswerProbability } from './calculate'
import { MultiDateContract } from './contract'
import { getMinMax } from './multi-numeric'
export const MAX_MULTI_NUMERIC_ANSWERS = 12

export function getExpectedDate(
  contract: MultiDateContract,
  initialOnly?: boolean
) {
  const { answers, shouldAnswersSumToOne, isResolved } = contract

  const answerProbabilities = filterDefined(
    answers.map((a) =>
      initialOnly
        ? getInitialAnswerProbability(contract, a)
        : isResolved
        ? a.prob
        : getAnswerProbability(contract, a.id)
    )
  )
  const answerMidpoints = answers.map((a) => a.midpoint!)

  if (shouldAnswersSumToOne) {
    // For bucket-style answers, simple weighted average
    return sum(answerProbabilities.map((p, i) => p * answerMidpoints[i]))
  } else {
    // For threshold-style answers, calculate discrete probabilities
    // First, get the discrete probabilities for each time period
    const discreteProbs = []

    // First period: probability of the first threshold
    discreteProbs.push(answerProbabilities[0])

    // Middle periods: difference between adjacent thresholds
    for (let i = 1; i < answerProbabilities.length; i++) {
      discreteProbs.push(answerProbabilities[i] - answerProbabilities[i - 1])
    }

    // Final period: remaining probability
    const afterLastProb =
      1 - answerProbabilities[answerProbabilities.length - 1]

    // Calculate expected value using discrete probabilities
    let expectedValue = 0

    // Sum probability-weighted time periods
    for (let i = 0; i < answerProbabilities.length; i++) {
      expectedValue += answerMidpoints[i] * discreteProbs[i]
    }

    // Handle the "after last threshold" case by using the last midpoint plus one time period
    if (afterLastProb > 0 && answerMidpoints.length > 0) {
      const lastMidpoint = answerMidpoints[answerMidpoints.length - 1]
      const secondLastMidpoint = answerMidpoints[answerMidpoints.length - 2]
      const timePeriod = lastMidpoint - secondLastMidpoint
      const beyondLastMidpoint = lastMidpoint + timePeriod
      expectedValue += beyondLastMidpoint * afterLastProb
    }

    return expectedValue
  }
}

export function formatExpectedDate(
  value: number,
  contract: MultiDateContract,
  contractPageView = true
) {
  const { answers } = contract
  const { min, max } = getMinMax(contract)
  // There are a few NaN & undefined values on dev
  if (isNaN(value) || min === undefined || max === undefined || max === min)
    return 'N/A'
  if (answers.length == 0) return '' // probably from static props

  const formatter = new Intl.DateTimeFormat(
    'en-US',
    contractPageView
      ? {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }
      : {
          month: 'numeric',
          day: 'numeric',
          year: '2-digit',
        }
  )
  return formatter.format(value)
}

export function getFormattedExpectedDate(
  contract: MultiDateContract,
  contractPageView = true
) {
  return formatExpectedDate(
    getExpectedDate(contract),
    contract,
    contractPageView
  )
}
