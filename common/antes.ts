import { Bet } from './bet'
import { getDpmProbability } from './calculate-dpm'
import { getCpmmLiquidity, getCpmmProbability } from './calculate-cpmm'
import { Binary, CPMM, DPM, FreeResponse, FullContract } from './contract'
import { User } from './user'
import { LiquidityProvision } from './liquidity-provision'

export const PHANTOM_ANTE = 0.001
export const MINIMUM_ANTE = 10

export function getCpmmAnteBet(
  creator: User,
  contract: FullContract<CPMM, Binary>,
  anteId: string,
  amount: number,
  outcome: 'YES' | 'NO'
) {
  const p = getCpmmProbability(contract.pool)

  const { createdTime } = contract

  const bet: Bet = {
    id: anteId,
    userId: creator.id,
    contractId: contract.id,
    amount: amount,
    shares: amount,
    outcome,
    probBefore: p,
    probAfter: p,
    createdTime,
    isAnte: true,
  }

  return bet
}

export function getCpmmInitialLiquidity(
  creator: User,
  contract: FullContract<CPMM, Binary>,
  anteId: string,
  amount: number
) {
  const { createdTime, pool } = contract
  const liquidity = getCpmmLiquidity(pool)

  const lp: LiquidityProvision = {
    id: anteId,
    userId: creator.id,
    contractId: contract.id,
    createdTime,
    isAnte: true,

    amount: amount,
    liquidity,
  }

  return lp
}

export function getAnteBets(
  creator: User,
  contract: FullContract<DPM, Binary>,
  yesAnteId: string,
  noAnteId: string
) {
  const p = getDpmProbability(contract.totalShares)
  const ante = contract.totalBets.YES + contract.totalBets.NO

  const { createdTime } = contract

  const yesBet: Bet = {
    id: yesAnteId,
    userId: creator.id,
    contractId: contract.id,
    amount: p * ante,
    shares: Math.sqrt(p) * ante,
    outcome: 'YES',
    probBefore: p,
    probAfter: p,
    createdTime,
    isAnte: true,
  }

  const noBet: Bet = {
    id: noAnteId,
    userId: creator.id,
    contractId: contract.id,
    amount: (1 - p) * ante,
    shares: Math.sqrt(1 - p) * ante,
    outcome: 'NO',
    probBefore: p,
    probAfter: p,
    createdTime,
    isAnte: true,
  }

  return { yesBet, noBet }
}

export function getFreeAnswerAnte(
  creator: User,
  contract: FullContract<DPM, FreeResponse>,
  anteBetId: string
) {
  const { totalBets, totalShares } = contract
  const amount = totalBets['0']
  const shares = totalShares['0']

  const { createdTime } = contract

  const anteBet: Bet = {
    id: anteBetId,
    userId: creator.id,
    contractId: contract.id,
    amount,
    shares,
    outcome: '0',
    probBefore: 0,
    probAfter: 1,
    createdTime,
    isAnte: true,
  }

  return anteBet
}
