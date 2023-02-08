import { groupBy, mapValues, sum, sumBy } from 'lodash'
import { Txn } from './txn'

// Returns a map of charity ids to the amount of M$ matched
export function quadraticMatches(
  txns: Txn[],
  matchingPool: number,
  // What txn field uniquely identifies the recipients
  // TODO: Perhaps this should always be toId anyways, to combat sockpuppet adding?
  groupField: 'toId' | 'data.answerId'
): Record<string, number> {
  // For each charity, group the donations by each individual donor
  const donationsByRecipient = groupBy(txns, groupField)
  const donationsByDonors = mapValues(donationsByRecipient, (txns) =>
    groupBy(txns, 'fromId')
  )

  // Weight for each charity = [sum of sqrt(individual donor)] ^ 2 - sum of donations
  const weights = mapValues(donationsByDonors, (byDonor) => {
    const sumByDonor = Object.values(byDonor).map((txns) =>
      sumBy(txns, 'amount')
    )
    const sumOfRoots = sumBy(sumByDonor, Math.sqrt)
    return clean(sumOfRoots ** 2 - sum(sumByDonor))
  })

  // Then distribute the matching pool based on the individual weights
  const totalWeight = sum(Object.values(weights))
  // Cap factor at 1 so that matching pool isn't always fully used
  const factor = Math.min(1, matchingPool / totalWeight)
  // Round to the nearest 0.01 mana
  return mapValues(weights, (weight) => Math.round(weight * factor * 100) / 100)
}

// If a number is epsilon close to 0, return 0
function clean(num: number) {
  const EPSILON = 0.0001
  return Math.abs(num) < EPSILON ? 0 : num
}
