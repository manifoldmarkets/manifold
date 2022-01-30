import { Bet } from './bet'
import { getProbability } from './calculate'
import { Contract, outcome } from './contract'
import { CREATOR_FEE, FEES } from './fees'

export const getCancelPayouts = (contract: Contract, bets: Bet[]) => {
  const { pool } = contract
  const poolTotal = pool.YES + pool.NO
  console.log('resolved N/A, pool M$', poolTotal)

  const betSum = sumBy(bets, (b) => b.amount)

  return bets.map((bet) => ({
    userId: bet.userId,
    payout: (bet.amount / betSum) * poolTotal,
  }))
}

export const getStandardPayouts = (
  outcome: 'YES' | 'NO',
  contract: Contract,
  bets: Bet[]
) => {
  const [yesBets, noBets] = partition(bets, (bet) => bet.outcome === 'YES')
  const winningBets = outcome === 'YES' ? yesBets : noBets

  const betSum = sumBy(winningBets, (b) => b.amount)

  const poolTotal = contract.pool.YES + contract.pool.NO

  if (betSum >= poolTotal) return getCancelPayouts(contract, winningBets)

  const shareDifferenceSum = sumBy(winningBets, (b) => b.shares - b.amount)

  const winningsPool = poolTotal - betSum

  const winnerPayouts = winningBets.map((bet) => ({
    userId: bet.userId,
    payout:
      bet.amount +
      (1 - 2 * FEES) *
        ((bet.shares - bet.amount) / shareDifferenceSum) *
        winningsPool,
  }))

  const creatorPayout = 2 * CREATOR_FEE * winningsPool

  console.log(
    'resolved',
    outcome,
    'pool: M$',
    poolTotal,
    'creator fee: M$',
    creatorPayout
  )

  return winnerPayouts.concat([
    { userId: contract.creatorId, payout: creatorPayout },
  ]) // add creator fee
}

export const getMktPayouts = (
  contract: Contract,
  bets: Bet[],
  resolutionProbability?: number
) => {
  const p =
    resolutionProbability === undefined
      ? getProbability(contract.totalShares)
      : resolutionProbability

  const poolTotal = contract.pool.YES + contract.pool.NO
  console.log('Resolved MKT at p=', p, 'pool: $M', poolTotal)

  const [yesBets, noBets] = partition(bets, (bet) => bet.outcome === 'YES')

  const weightedBetTotal =
    p * sumBy(yesBets, (b) => b.amount) +
    (1 - p) * sumBy(noBets, (b) => b.amount)

  if (weightedBetTotal >= poolTotal) {
    return bets.map((bet) => ({
      userId: bet.userId,
      payout:
        (((bet.outcome === 'YES' ? p : 1 - p) * bet.amount) /
          weightedBetTotal) *
        poolTotal,
    }))
  }

  const winningsPool = poolTotal - weightedBetTotal

  const weightedShareTotal =
    p * sumBy(yesBets, (b) => b.shares - b.amount) +
    (1 - p) * sumBy(noBets, (b) => b.shares - b.amount)

  const yesPayouts = yesBets.map((bet) => ({
    userId: bet.userId,
    payout:
      p * bet.amount +
      (1 - 2 * FEES) *
        ((p * (bet.shares - bet.amount)) / weightedShareTotal) *
        winningsPool,
  }))

  const noPayouts = noBets.map((bet) => ({
    userId: bet.userId,
    payout:
      (1 - p) * bet.amount +
      (1 - 2 * FEES) *
        (((1 - p) * (bet.shares - bet.amount)) / weightedShareTotal) *
        winningsPool,
  }))

  const creatorPayout = 2 * CREATOR_FEE * winningsPool

  return [
    ...yesPayouts,
    ...noPayouts,
    { userId: contract.creatorId, payout: creatorPayout },
  ]
}

export const getPayouts = (
  outcome: outcome,
  contract: Contract,
  bets: Bet[],
  resolutionProbability?: number
) => {
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getStandardPayouts(outcome, contract, bets)
    case 'MKT':
      return getMktPayouts(contract, bets, resolutionProbability)
    case 'CANCEL':
      return getCancelPayouts(contract, bets)
  }
}

const partition = <T>(array: T[], f: (t: T) => boolean) => {
  const yes = []
  const no = []

  for (let t of array) {
    if (f(t)) yes.push(t)
    else no.push(t)
  }

  return [yes, no] as [T[], T[]]
}

const sumBy = <T>(array: T[], f: (t: T) => number) => {
  const values = array.map(f)
  return values.reduce((prev, cur) => prev + cur, 0)
}
