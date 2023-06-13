import { range } from 'lodash'
import { Bet, NumericBet } from './bet'
import { getDpmProbability, getValueFromBucket } from './calculate-dpm'
import {
  CPMMBinaryContract,
  DPMBinaryContract,
  FreeResponseContract,
  NumericContract,
  DpmMultipleChoiceContract,
  CPMMMultiContract,
} from './contract'
import { User } from './user'
import { LiquidityProvision } from './liquidity-provision'
import { noFees } from './fees'
import { DpmAnswer } from './answer'
import { removeUndefinedProps } from './util/object'

export const HOUSE_LIQUIDITY_PROVIDER_ID = 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2' // @ManifoldMarkets' id
export const DEV_HOUSE_LIQUIDITY_PROVIDER_ID = '94YYTk1AFWfbWMpfYcvnnwI1veP2' // @ManifoldMarkets' id
export const UNIQUE_BETTOR_LIQUIDITY_AMOUNT = 20

type NormalizedBet<T extends Bet = Bet> = Omit<
  T,
  'userAvatarUrl' | 'userName' | 'userUsername'
>

export function getCpmmInitialLiquidity(
  providerId: string,
  contract: CPMMBinaryContract | CPMMMultiContract,
  anteId: string,
  amount: number
) {
  const { createdTime, mechanism } = contract

  const pool = mechanism === 'cpmm-1' ? { YES: 0, NO: 0 } : undefined

  const lp: LiquidityProvision = removeUndefinedProps({
    id: anteId,
    userId: providerId,
    contractId: contract.id,
    createdTime,
    isAnte: true,

    amount: amount,
    liquidity: amount,
    pool,
  })

  return lp
}

export function getMultipleChoiceAntes(
  creator: User,
  contract: DpmMultipleChoiceContract,
  answers: string[],
  betDocIds: string[]
) {
  const { totalBets, totalShares } = contract
  const amount = totalBets['0']
  const shares = totalShares['0']
  const p = 1 / answers.length

  const { createdTime } = contract

  const bets: NormalizedBet[] = answers.map((answer, i) => ({
    id: betDocIds[i],
    userId: creator.id,
    contractId: contract.id,
    amount,
    shares,
    outcome: i.toString(),
    probBefore: p,
    probAfter: p,
    createdTime,
    isAnte: true,
    isRedemption: false,
    isChallenge: false,
    fees: noFees,
    visibility: contract.visibility,
  }))

  const { username, name, avatarUrl } = creator

  const answerObjects: DpmAnswer[] = answers.map((answer, i) => ({
    id: i.toString(),
    number: i,
    contractId: contract.id,
    createdTime,
    userId: creator.id,
    username,
    name,
    avatarUrl,
    text: answer,
  }))

  return { bets, answerObjects }
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

  const yesBet: NormalizedBet = {
    id: yesAnteId,
    userId: creator.id,
    contractId: contract.id,
    amount: p * ante,
    shares: Math.sqrt(p) * ante,
    outcome: 'YES',
    probBefore: p,
    probAfter: p,
    createdTime,
    fees: noFees,
    isAnte: true,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
  }

  const noBet: NormalizedBet = {
    id: noAnteId,
    userId: creator.id,
    contractId: contract.id,
    amount: (1 - p) * ante,
    shares: Math.sqrt(1 - p) * ante,
    outcome: 'NO',
    probBefore: p,
    probAfter: p,
    createdTime,
    fees: noFees,
    isAnte: true,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
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

  const anteBet: NormalizedBet = {
    id: anteBetId,
    userId: anteBettorId,
    contractId: contract.id,
    amount,
    shares,
    outcome: '0',
    probBefore: 0,
    probAfter: 1,
    createdTime,
    fees: noFees,
    isAnte: true,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
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

  const anteBet: NormalizedBet<NumericBet> = {
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
    fees: noFees,
    isAnte: true,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
  }

  return anteBet
}
