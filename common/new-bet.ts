import * as _ from 'lodash'
import { Bet, MAX_LOAN_PER_CONTRACT } from './bet'
import {
  calculateDpmShares,
  getDpmProbability,
  getDpmOutcomeProbability,
} from './calculate-dpm'
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
  loanAmount: number,
  newBetId: string
) => {
  const { pool, k } = contract

  const shares = calculateCpmmShares(pool, k, amount, outcome)
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + amount, amount]
      : [amount, n - shares + amount]

  const newBalance = user.balance - (amount - loanAmount)

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
    loanAmount,
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
  loanAmount: number,
  newBetId: string
) => {
  const { YES: yesPool, NO: noPool } = contract.pool

  const newPool =
    outcome === 'YES'
      ? { YES: yesPool + amount, NO: noPool }
      : { YES: yesPool, NO: noPool + amount }

  const shares = calculateDpmShares(contract.totalShares, amount, outcome)

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

  const probBefore = getDpmProbability(contract.totalShares)
  const probAfter = getDpmProbability(newTotalShares)

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount,
    loanAmount,
    shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
  }

  const newBalance = user.balance - (amount - loanAmount)

  return { newBet, newPool, newTotalShares, newTotalBets, newBalance }
}

export const getNewMultiBetInfo = (
  user: User,
  outcome: string,
  amount: number,
  contract: FullContract<DPM, Multi | FreeResponse>,
  loanAmount: number,
  newBetId: string
) => {
  const { pool, totalShares, totalBets } = contract

  const prevOutcomePool = pool[outcome] ?? 0
  const newPool = { ...pool, [outcome]: prevOutcomePool + amount }

  const shares = calculateDpmShares(contract.totalShares, amount, outcome)

  const prevShares = totalShares[outcome] ?? 0
  const newTotalShares = { ...totalShares, [outcome]: prevShares + shares }

  const prevTotalBets = totalBets[outcome] ?? 0
  const newTotalBets = { ...totalBets, [outcome]: prevTotalBets + amount }

  const probBefore = getDpmOutcomeProbability(totalShares, outcome)
  const probAfter = getDpmOutcomeProbability(newTotalShares, outcome)

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount,
    loanAmount,
    shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
  }

  const newBalance = user.balance - (amount - loanAmount)

  return { newBet, newPool, newTotalShares, newTotalBets, newBalance }
}

export const getLoanAmount = (yourBets: Bet[], newBetAmount: number) => {
  const openBets = yourBets.filter((bet) => !bet.isSold && !bet.sale)
  const prevLoanAmount = _.sumBy(openBets, (bet) => bet.loanAmount ?? 0)
  const loanAmount = Math.min(
    newBetAmount,
    MAX_LOAN_PER_CONTRACT - prevLoanAmount
  )
  return loanAmount
}
