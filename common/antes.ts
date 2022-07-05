import { range } from 'lodash'
import { Bet, NumericBet } from './bet'
import { getDpmProbability, getValueFromBucket } from './calculate-dpm'
import {
  CPMMBinaryContract,
  DPMBinaryContract,
  FreeResponseContract,
  NumericContract,
} from './contract'
import { User } from './user'
import { LiquidityProvision } from './liquidity-provision'
import { noFees } from './fees'
import { ENV_CONFIG } from './envs/constants'

export const FIXED_ANTE = ENV_CONFIG.fixedAnte ?? 100

export const HOUSE_LIQUIDITY_PROVIDER_ID = 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2' // @ManifoldMarkets' id

export function getCpmmInitialLiquidity(
  providerId: string,
  contract: CPMMBinaryContract,
  anteId: string,
  amount: number
) {
  const { createdTime, p } = contract

  const lp: LiquidityProvision = {
    id: anteId,
    userId: providerId,
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
  contract: DPMBinaryContract,
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
  anteBettorId: string,
  contract: FreeResponseContract,
  anteBetId: string
) {
  const { totalBets, totalShares } = contract
  const amount = totalBets['0']
  const shares = totalShares['0']

  const { createdTime } = contract

  const anteBet: Bet = {
    id: anteBetId,
    userId: anteBettorId,
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

export function getNumericAnte(
  anteBettorId: string,
  contract: NumericContract,
  ante: number,
  newBetId: string
) {
  const { bucketCount, createdTime } = contract

  const betAnte = ante / bucketCount
  const betShares = Math.sqrt(ante ** 2 / bucketCount)

  const allOutcomeShares = Object.fromEntries(
    range(0, bucketCount).map((_, i) => [i, betShares])
  )

  const allBetAmounts = Object.fromEntries(
    range(0, bucketCount).map((_, i) => [i, betAnte])
  )

  const anteBet: NumericBet = {
    id: newBetId,
    userId: anteBettorId,
    contractId: contract.id,
    amount: ante,
    allBetAmounts,
    outcome: '0',
    value: getValueFromBucket('0', contract),
    shares: betShares,
    allOutcomeShares,
    probBefore: 0,
    probAfter: 1 / bucketCount,
    createdTime,
    isAnte: true,
    fees: noFees,
  }

  return anteBet
}
