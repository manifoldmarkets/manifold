import { Bet } from './bet'
import {
  calculateShares,
  getProbability,
  getOutcomeProbability,
} from './calculate'
import { Contract } from './contract'
import { User } from './user'

export const getNewBinaryBetInfo = (
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

export const getNewMultiBetInfo = (
  user: User,
  outcome: string,
  amount: number,
  contract: Contract<'MULTI'>,
  newBetId: string
) => {
  const { pool, totalShares, totalBets } = contract

  const prevOutcomePool = pool[outcome] ?? 0
  const newPool = { ...pool, outcome: prevOutcomePool + amount }

  const shares = calculateShares(contract.totalShares, amount, outcome)

  const prevShares = totalShares[outcome] ?? 0
  const newTotalShares = { ...totalShares, outcome: prevShares + shares }

  const prevTotalBets = totalBets[outcome] ?? 0
  const newTotalBets = { ...totalBets, outcome: prevTotalBets + amount }

  const probBefore = getOutcomeProbability(totalShares, outcome)
  const probAfter = getOutcomeProbability(newTotalShares, outcome)

  const newBet: Bet<'MULTI'> = {
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
