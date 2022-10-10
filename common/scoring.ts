import { groupBy, sumBy, mapValues, keyBy, sortBy } from 'lodash'

import { Bet } from './bet'
import { getContractBetMetrics, resolvedPayout } from './calculate'
import { Contract } from './contract'
import { ContractComment } from './comment'

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
  const betsByUser = groupBy(bets, (bet) => bet.userId)
  return mapValues(
    betsByUser,
    (bets) => getContractBetMetrics(contract, bets).profit
  )
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

export function scoreCommentorsAndBettors(
  contract: Contract,
  bets: Bet[],
  comments: ContractComment[]
) {
  const commentsById = keyBy(comments, 'id')
  const betsById = keyBy(bets, 'id')

  // If 'id2' is the sale of 'id1', both are logged with (id2 - id1) of profit
  // Otherwise, we record the profit at resolution time
  const profitById: Record<string, number> = {}
  for (const bet of bets) {
    if (bet.sale) {
      const originalBet = betsById[bet.sale.betId]
      const profit = bet.sale.amount - originalBet.amount
      profitById[bet.id] = profit
      profitById[originalBet.id] = profit
    } else {
      profitById[bet.id] = resolvedPayout(contract, bet) - bet.amount
    }
  }

  // Now find the betId with the highest profit
  const topBetId = sortBy(bets, (b) => -profitById[b.id])[0]?.id
  const topBettor = betsById[topBetId]?.userName

  // And also the commentId of the comment with the highest profit
  const topCommentId = sortBy(
    comments,
    (c) => c.betId && -profitById[c.betId]
  )[0]?.id
  const topCommentBetId = commentsById[topCommentId]?.betId

  return {
    topCommentId,
    topBetId,
    topBettor,
    profitById,
    commentsById,
    betsById,
    topCommentBetId,
  }
}
