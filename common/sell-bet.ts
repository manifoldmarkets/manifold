import { Bet } from './bet'
import { calculateShareValue, deductFees, getProbability } from './calculate'
import { Contract } from './contract'
import { CREATOR_FEE, FEES } from './fees'
import { User } from './user'

export const getSellBetInfo = (
  user: User,
  bet: Bet,
  contract: Contract,
  newBetId: string
) => {
  const { id: betId, amount, shares, outcome } = bet

  const { YES: yesPool, NO: noPool } = contract.pool
  const { YES: yesShares, NO: noShares } = contract.totalShares
  const { YES: yesBets, NO: noBets } = contract.totalBets

  const adjShareValue = calculateShareValue(contract, bet)

  const newPool =
    outcome === 'YES'
      ? { YES: yesPool - adjShareValue, NO: noPool }
      : { YES: yesPool, NO: noPool - adjShareValue }

  const newTotalShares =
    outcome === 'YES'
      ? { YES: yesShares - shares, NO: noShares }
      : { YES: yesShares, NO: noShares - shares }

  const newTotalBets =
    outcome === 'YES'
      ? { YES: yesBets - amount, NO: noBets }
      : { YES: yesBets, NO: noBets - amount }

  const probBefore = getProbability(contract.totalShares)
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

  const newBalance = user.balance + saleAmount

  return {
    newBet,
    newPool,
    newTotalShares,
    newTotalBets,
    newBalance,
    creatorFee,
  }
}
