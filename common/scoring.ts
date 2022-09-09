import { groupBy, sumBy, mapValues, partition } from 'lodash'

import { Bet } from './bet'
import { getContractBetMetrics } from './calculate'
import { Contract } from './contract'
import { getPayouts } from './payouts'

export function scoreCreators(contracts: Contract[]) {
  const creatorScore = mapValues(
    groupBy(contracts, ({ creatorId }) => creatorId),
    (contracts) =>
      sumBy(
        contracts.map((contract) => {
          return contract.volume
        })
      )
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

export function scoreUsersByContract(contract: Contract, bets: Bet[]) {
  const profits = bets.map((bet) => {
    const { userId } = bet
    const payout = getContractBetMetrics(contract, [bet]).profit
    console.log({
      userId: userId,
      metrics: getContractBetMetrics(contract, [bet]),
    })
    return { userId: userId, payout: payout }
  })

  const netPayouts = [...profits]

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
