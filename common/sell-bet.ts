import { Bet } from './bet'
import { calculateShareValue, deductFees, getProbability } from './calculate'
import { Contract } from './contract'
import { CREATOR_FEE } from './fees'
import { User } from './user'

export const getSellBetInfo = (
  user: User,
  bet: Bet,
  contract: Contract,
  newBetId: string
) => {
  const { pool, totalShares, totalBets } = contract
  const { id: betId, amount, shares, outcome, loanAmount } = bet

  const adjShareValue = calculateShareValue(contract, bet)

  const newPool = { ...pool, [outcome]: pool[outcome] - adjShareValue }

  const newTotalShares = {
    ...totalShares,
    [outcome]: totalShares[outcome] - shares,
  }

  const newTotalBets = { ...totalBets, [outcome]: totalBets[outcome] - amount }

  const probBefore = getProbability(totalShares)
  const probAfter = getProbability(newTotalShares)

  const profit = adjShareValue - amount
  const creatorFee = CREATOR_FEE * Math.max(0, profit)
  const saleAmount = deductFees(amount, adjShareValue)

  console.log(
    'SELL M$',
    amount,
    outcome,
    'for M$',
    saleAmount,
    'creator fee: M$',
    creatorFee
  )

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount: -adjShareValue,
    shares: -shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    sale: {
      amount: saleAmount,
      betId,
    },
  }

  const newBalance = user.balance + saleAmount - (loanAmount ?? 0)

  return {
    newBet,
    newPool,
    newTotalShares,
    newTotalBets,
    newBalance,
    creatorFee,
  }
}
