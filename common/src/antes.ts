import { Bet } from './bet'
import {
  CPMMBinaryContract,
  DpmMultipleChoiceContract,
  CPMMMultiContract,
} from './contract'
import { User } from './user'
import { noFees } from './fees'
import { DpmAnswer } from './answer'
import { removeUndefinedProps } from './util/object'
import { AddSubsidyTxn } from './txn'

export const HOUSE_LIQUIDITY_PROVIDER_ID = 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2' // @ManifoldMarkets' id
export const DEV_HOUSE_LIQUIDITY_PROVIDER_ID = '94YYTk1AFWfbWMpfYcvnnwI1veP2' // @ManifoldMarkets' id

type NormalizedBet<T extends Bet = Bet> = Omit<
  T,
  'userAvatarUrl' | 'userName' | 'userUsername'
>

export function getCpmmInitialLiquidityTxn(
  providerId: string,
  contract: CPMMBinaryContract | CPMMMultiContract,
  amount: number,
  answerId?: string
) {
  const { mechanism } = contract

  if (mechanism === 'cpmm-1') {
    throw new Error(' DPM is deprecated by now')
  }

  return {
    category: 'ADD_SUBSIDY',
    fromType: 'USER',
    fromId: providerId,
    toType: 'CONTRACT',
    toId: contract.id,
    amount,
    token: 'M$',
    data: removeUndefinedProps({
      isAnte: true,
      answerId,
    }),
  } as const
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
