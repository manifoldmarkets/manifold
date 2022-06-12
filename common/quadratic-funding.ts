import { groupBy, mapValues, sum } from 'lodash'
import { Txn } from './txn'

// Returns a map of charity ids to the amount of M$ matched
export function quadraticMatches(
  allCharityTxns: Txn[],
  matchingPool: number
): Record<string, number> {
  // For each charity, group the donations by each individual donor
  const donationsByCharity = groupBy(allCharityTxns, 'toId')
  const donationsByDonors = mapValues(donationsByCharity, (txns) =>
    groupBy(txns, 'fromId')
  )

  // Weight for each charity = [sum of sqrt(individual donor)] ^ 2
  const weights = mapValues(donationsByDonors, (byDonor) => {
    const sumByDonor = Object.values(byDonor)
      .map((txns) => sumBy(txns, "amount"))
    const sumOfRoots = sumBy(sumByDonor, Math.sqrt)
    return sumOfRoots ** 2
  }

  // Then distribute the matching pool based on the individual weights
  const totalWeight = sum(Object.values(weights))
  return mapValues(weights, (weight) => matchingPool * (weight / totalWeight))
}
