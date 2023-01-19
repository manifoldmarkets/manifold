import { groupBy, mapValues, sum, sumBy } from 'lodash'
import { Txn } from './txn'

// Returns a map of charity ids to the amount of M$ matched
export function quadraticMatches(
  txns: Txn[],
  matchingPool: number,
  // What txn field uniquely identifies the recipients
  groupField: 'toId' | 'data.answerId'
): Record<string, number> {
  // For each charity, group the donations by each individual donor
  const donationsByRecipient = groupBy(txns, groupField)
  const donationsByDonors = mapValues(donationsByRecipient, (txns) =>
    groupBy(txns, 'fromId')
  )

  // Weight for each charity = [sum of sqrt(individual donor)] ^ 2
  const weights = mapValues(donationsByDonors, (byDonor) => {
    const sumByDonor = Object.values(byDonor).map((txns) =>
      sumBy(txns, 'amount')
    )
    const sumOfRoots = sumBy(sumByDonor, Math.sqrt)
    return sumOfRoots ** 2
  })

  // Then distribute the matching pool based on the individual weights
  const totalWeight = sum(Object.values(weights))
  return mapValues(weights, (weight) => matchingPool * (weight / totalWeight))
}
