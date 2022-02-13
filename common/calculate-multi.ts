import * as _ from 'lodash'

export function getMultiProbability(
  totalShares: {
    [answerId: string]: number
  },
  answerId: string
) {
  const squareSum = _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
  const shares = totalShares[answerId] ?? 0
  return shares ** 2 / squareSum
}

export function calculateMultiShares(
  totalShares: {
    [answerId: string]: number
  },
  bet: number,
  betChoice: string
) {
  const squareSum = _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
  const shares = totalShares[betChoice] ?? 0

  const c = 2 * bet * Math.sqrt(squareSum)

  return Math.sqrt(bet ** 2 + shares ** 2 + c) - shares
}
