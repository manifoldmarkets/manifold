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
  const betsByUser = groupBy(bets, bet => bet.userId)
  return mapValues(betsByUser, bets => getContractBetMetrics(contract, bets).profit)
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
