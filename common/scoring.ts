import { groupBy, sumBy, mapValues, partition } from 'lodash'

import { Bet } from './bet'
import { Binary, Contract, FullContract } from './contract'
import { getPayouts } from './payouts'

export function scoreCreators(contracts: Contract[]) {
  const creatorScore = mapValues(
    groupBy(contracts, ({ creatorId }) => creatorId),
    (contracts) => sumBy(contracts, ({ pool }) => pool.YES + pool.NO)
  )

  return creatorScore
}

export function scoreTraders(contracts: Contract[], bets: Bet[][]) {
  const userScoresByContract = contracts.map((contract, index) =>
    scoreUsersByContract(contract, bets[index])
  )
  const userScores: { [userId: string]: number } = {}
  for (const scores of userScoresByContract) {
    addUserScores(scores, userScores)
  }
  return userScores
}

export function scoreUsersByContract(
  contract: FullContract<any, Binary>,
  bets: Bet[]
) {
  const { resolution, resolutionProbability } = contract

  const [closedBets, openBets] = partition(
    bets,
    (bet) => bet.isSold || bet.sale
  )
  const { payouts: resolvePayouts } = getPayouts(
    resolution,
    {},
    contract,
    openBets,
    [],
    resolutionProbability
  )

  const salePayouts = closedBets.map((bet) => {
    const { userId, sale } = bet
    return { userId, payout: sale ? sale.amount : 0 }
  })

  const investments = bets
    .filter((bet) => !bet.sale)
    .map((bet) => {
      const { userId, amount, loanAmount } = bet
      const payout = -amount - (loanAmount ?? 0)
      return { userId, payout }
    })

  const netPayouts = [...resolvePayouts, ...salePayouts, ...investments]

  const userScore = mapValues(
    groupBy(netPayouts, (payout) => payout.userId),
    (payouts) => sumBy(payouts, ({ payout }) => payout)
  )

  return userScore
}

export function addUserScores(
  src: { [userId: string]: number },
  dest: { [userId: string]: number }
) {
  for (const [userId, score] of Object.entries(src)) {
    if (dest[userId] === undefined) dest[userId] = 0
    dest[userId] += score
  }
}
