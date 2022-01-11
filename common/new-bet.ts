import { Bet } from './bet'
import { calculateShares, getProbability } from './calculate'
import { Contract } from './contract'
import { User } from './user'

export const getNewBetInfo = (
  user: User,
  outcome: 'YES' | 'NO',
  amount: number,
  contract: Contract,
  newBetId: string
) => {
  const { YES: yesPool, NO: noPool } = contract.pool

  const newPool =
    outcome === 'YES'
      ? { YES: yesPool + amount, NO: noPool }
      : { YES: yesPool, NO: noPool + amount }

  const shares = calculateShares(contract.totalShares, amount, outcome)

  const { YES: yesShares, NO: noShares } = contract.totalShares

  const newTotalShares =
    outcome === 'YES'
      ? { YES: yesShares + shares, NO: noShares }
      : { YES: yesShares, NO: noShares + shares }

  const { YES: yesBets, NO: noBets } = contract.totalBets

  const newTotalBets =
    outcome === 'YES'
      ? { YES: yesBets + amount, NO: noBets }
      : { YES: yesBets, NO: noBets + amount }

  const probBefore = getProbability(contract.totalShares)
  const probAfter = getProbability(newTotalShares)

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount,
    shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
  }

  const newBalance = user.balance - amount

  return { newBet, newPool, newTotalShares, newTotalBets, newBalance }
}
