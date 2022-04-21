import { Bet } from './bet'
import { getDpmProbability } from './calculate-dpm'
import { Binary, CPMM, DPM, FreeResponse, FullContract } from './contract'
import { User } from './user'
import { LiquidityProvision } from './liquidity-provision'
import { noFees } from './fees'

export const FIXED_ANTE = 50

// deprecated
export const PHANTOM_ANTE = 0.001
export const MINIMUM_ANTE = 50

export function getCpmmInitialLiquidity(
  creator: User,
  contract: FullContract<CPMM, Binary>,
  anteId: string,
  amount: number
) {
  const { createdTime, p } = contract

  const lp: LiquidityProvision = {
    id: anteId,
    userId: creator.id,
    contractId: contract.id,
    createdTime,
    isAnte: true,

    amount: amount,
    liquidity: amount,
    p: p,
    pool: { YES: 0, NO: 0 },
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
    fees: noFees,
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
    fees: noFees,
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
    fees: noFees,
  }

  return anteBet
}
