import { Bet } from './bet'
import {
  calculateShares,
  getProbability,
  getOutcomeProbability,
} from './calculate'
import { calculateCpmmShares, getCpmmProbability } from './calculate-cpmm'
import {
  Binary,
  CPMM,
  DPM,
  FreeResponse,
  FullContract,
  Multi,
} from './contract'
import { User } from './user'

export const getNewBinaryCpmmBetInfo = (
  user: User,
  outcome: 'YES' | 'NO',
  amount: number,
  contract: FullContract<CPMM, Binary>,
  newBetId: string
) => {
  const { pool, k } = contract

  const shares = calculateCpmmShares(pool, k, amount, outcome)
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + amount, amount]
      : [amount, n - shares + amount]

  const newBalance = user.balance - amount

  const probBefore = getCpmmProbability(pool)
  const newPool = { YES: newY, NO: newN }
  const probAfter = getCpmmProbability(newPool)

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

  return { newBet, newPool, newBalance }
}

export const getNewBinaryDpmBetInfo = (
  user: User,
  outcome: 'YES' | 'NO',
  amount: number,
  contract: FullContract<DPM, Binary>,
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
  contract: FullContract<DPM, Multi | FreeResponse>,
  newBetId: string
) => {
  const { pool, totalShares, totalBets } = contract

  const prevOutcomePool = pool[outcome] ?? 0
  const newPool = { ...pool, [outcome]: prevOutcomePool + amount }

  const shares = calculateShares(contract.totalShares, amount, outcome)

  const prevShares = totalShares[outcome] ?? 0
  const newTotalShares = { ...totalShares, [outcome]: prevShares + shares }

  const prevTotalBets = totalBets[outcome] ?? 0
  const newTotalBets = { ...totalBets, [outcome]: prevTotalBets + amount }

  const probBefore = getOutcomeProbability(totalShares, outcome)
  const probAfter = getOutcomeProbability(newTotalShares, outcome)

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
