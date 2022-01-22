import _ from 'lodash'
import { Contract } from '../../../common/contract'
import { getPayouts } from '../../../common/payouts'
import { Bet } from './bets'

export function scoreCreators(contracts: Contract[], bets: Bet[][]) {
  const creatorScore = _.mapValues(
    _.groupBy(contracts, ({ creatorId }) => creatorId),
    (contracts) => _.sumBy(contracts, ({ pool }) => pool.YES + pool.NO)
  )

  return creatorScore
}

export function scoreTraders(contracts: Contract[], bets: Bet[][]) {
  const userScoresByContract = contracts.map((contract, index) =>
    scoreUsersByContract(contract, bets[index])
  )
  const userScores: { [userId: string]: number } = {}
  for (const scores of userScoresByContract) {
    for (const [userId, score] of Object.entries(scores)) {
      if (userScores[userId] === undefined) userScores[userId] = 0
      userScores[userId] += score
    }
  }
  return userScores
}

function scoreUsersByContract(contract: Contract, bets: Bet[]) {
  const { resolution } = contract

  const [closedBets, openBets] = _.partition(
    bets,
    (bet) => bet.isSold || bet.sale
  )
  const resolvePayouts = getPayouts(resolution ?? 'MKT', contract, openBets)

  const salePayouts = closedBets.map((bet) => {
    const { userId, sale } = bet
    return { userId, payout: sale ? sale.amount : 0 }
  })

  const investments = bets
    .filter((bet) => !bet.sale)
    .map((bet) => {
      const { userId, amount } = bet
      return { userId, payout: -amount }
    })

  const netPayouts = [...resolvePayouts, ...salePayouts, ...investments]

  const userScore = _.mapValues(
    _.groupBy(netPayouts, (payout) => payout.userId),
    (payouts) => _.sumBy(payouts, ({ payout }) => payout)
  )

  return userScore
}
