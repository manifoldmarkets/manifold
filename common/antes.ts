import { Bet } from './bet'
import { getProbability } from './calculate-dpm'
import { getCpmmProbability } from './calculate-cpmm'
import { Binary, CPMM, DPM, FreeResponse, FullContract } from './contract'
import { User } from './user'

export const PHANTOM_ANTE = 0.001
export const MINIMUM_ANTE = 10

export const calcStartCpmmPool = (initialProbInt: number, ante: number) => {
  const p = initialProbInt / 100.0
  const invP = 1.0 / p - 1
  const otherAnte = ante / invP

  const [poolYes, poolNo] = p >= 0.5 ? [otherAnte, ante] : [ante, otherAnte]
  const k = poolYes * poolNo

  return { poolYes, poolNo, k }
}

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

export const calcStartPool = (initialProbInt: number, ante = 0) => {
  const p = initialProbInt / 100.0
  const totalAnte = PHANTOM_ANTE + ante

  const sharesYes = Math.sqrt(p * totalAnte ** 2)
  const sharesNo = Math.sqrt(totalAnte ** 2 - sharesYes ** 2)

  const poolYes = p * ante
  const poolNo = (1 - p) * ante

  const phantomYes = Math.sqrt(p) * PHANTOM_ANTE
  const phantomNo = Math.sqrt(1 - p) * PHANTOM_ANTE

  return { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo }
}

export function getAnteBets(
  creator: User,
  contract: FullContract<DPM, Binary>,
  yesAnteId: string,
  noAnteId: string
) {
  const p = getProbability(contract.totalShares)
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
