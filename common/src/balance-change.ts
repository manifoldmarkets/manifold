import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Visibility } from 'common/contract'
import { QuestType } from 'common/quest'
import { Answer } from 'common/answer'
import { AnyTxnCategory, Txn } from './txn'
import { PROFIT_FEE_FRACTION } from './economy'

export type AnyBalanceChangeType = BetBalanceChange | TxnBalanceChange

export type BalanceChange = {
  type: string
  key: string
  amount: number
  createdTime: number
}

type MinimalContract = {
  question: string
  slug?: string
  visibility: Visibility
  creatorUsername: string
  token: 'MANA' | 'CASH'
}

export const BET_BALANCE_CHANGE_TYPES = [
  'create_bet',
  'sell_shares',
  'redeem_shares',
  'fill_bet',
  'loan_payment',
] as const

export type BetBalanceChange = BalanceChange & {
  type: (typeof BET_BALANCE_CHANGE_TYPES)[number]
  bet: Pick<Bet, 'outcome' | 'shares'>
  answer: Pick<Answer, 'text' | 'id'> | undefined
  contract: MinimalContract
}

export type TxnBalanceChange = BalanceChange & {
  type: AnyTxnCategory
  token: Txn['token']
  contract?: MinimalContract
  questType?: QuestType
  user?: Pick<User, 'username' | 'name'>
  charity?: { name: string; slug: string }
  description?: string
}

export const isBetChange = (
  change: AnyBalanceChangeType
): change is BetBalanceChange =>
  BET_BALANCE_CHANGE_TYPES.includes(change.type as any)

export const isTxnChange = (
  change: AnyBalanceChangeType
): change is TxnBalanceChange => !('bet' in change)

export const betChangeToText = (change: BetBalanceChange) => {
  const { type, bet } = change
  const { outcome } = bet
  return type === 'redeem_shares'
    ? `Redeem shares`
    : type === 'loan_payment'
    ? `Pay back loan`
    : type === 'fill_bet'
    ? `Fill ${outcome} order`
    : type === 'sell_shares'
    ? `Sell ${outcome} shares`
    : `Buy ${outcome}`
}

export const txnTitle = (change: TxnBalanceChange) => {
  const { type, contract, user, questType, charity } = change

  if (user) {
    return user.username
  }
  if (charity) {
    return charity.name
  }
  if (contract) {
    return contract.question
  }

  switch (type) {
    case 'QUEST_REWARD':
      return questType ? questTypeToDescription(questType) : ''
    case 'BETTING_STREAK_BONUS':
      return 'Prediction streak bonus' // usually the question instead
    case 'LOAN':
      return 'Loan'
    case 'LEAGUE_PRIZE':
      return 'League prize'
    case 'MANA_PURCHASE':
      return 'Mana purchase'
    case 'MARKET_BOOST_REDEEM':
      return 'Claim boost'
    case 'SIGNUP_BONUS':
      return change.description ?? 'Signup bonus'
    case 'REFERRAL':
      return 'Referral bonus'
    case 'CONSUME_SPICE':
    case 'CONSUME_SPICE_DONE':
      return `Redeem prize points for mana`
    case 'CONVERT_CASH':
    case 'CONVERT_CASH_DONE':
      return 'Redeem sweepcash for mana'
    case 'CASH_OUT':
      return 'Redemption request'
    case 'CASH_BONUS':
      return 'Sweepcash bonus'
    case 'KYC_BONUS':
      return 'ID verification bonus'
    case 'CONTRACT_RESOLUTION_FEE':
    case 'UNDO_CONTRACT_RESOLUTION_FEE':
      return ''
    default:
      return type
  }
}

export const txnTypeToDescription = (txnCategory: string) => {
  switch (txnCategory) {
    case 'MARKET_BOOST_CREATE':
      return 'Boost'
    case 'CANCEL_UNIQUE_BETTOR_BONUS':
      return 'Cancel unique trader bonus'
    case 'PRODUCE_SPICE':
    case 'CONTRACT_RESOLUTION_PAYOUT':
      return 'Payout'
    case 'CREATE_CONTRACT_ANTE':
      return 'Ante'
    case 'UNIQUE_BETTOR_BONUS':
      return 'Trader bonus'
    case 'BETTING_STREAK_BONUS':
      return 'Quests'
    case 'SIGNUP_BONUS':
    case 'KYC_BONUS':
      return 'New user bonuses'
    case 'REFERRAL':
      return 'Quests'
    case 'QUEST_REWARD':
      return 'Quests'
    case 'CONTRACT_UNDO_PRODUCE_SPICE':
    case 'CONTRACT_UNDO_RESOLUTION_PAYOUT':
      return 'Unresolve'
    case 'CONSUME_SPICE':
    case 'CONSUME_SPICE_DONE':
    case 'CONVERT_CASH':
    case 'CONVERT_CASH_DONE':
      return ''
    case 'MANA_PURCHASE':
      return ''
    case 'ADD_SUBSIDY':
      return 'Subsidy'
    case 'MARKET_BOOST_REDEEM':
      return 'Leagues'
    case 'BOUNTY_POSTED':
      return 'Ante'
    case 'BOUNTY_AWARDED':
      return 'Bounty awarded'
    case 'MANA_PAYMENT':
      return 'User payment'
    case 'CHARITY':
      return 'Donation'
    case 'LOAN':
      return ''
    case 'CONTRACT_RESOLUTION_FEE':
      return `${PROFIT_FEE_FRACTION * 100}% fee on profit at resolution`
    case 'UNDO_CONTRACT_RESOLUTION_FEE':
      return `Undo ${PROFIT_FEE_FRACTION * 100}% profit fee at resolution`
    default:
      return null
  }
}

const questTypeToDescription = (questType: QuestType) => {
  switch (questType) {
    case 'SHARES':
      return 'Sharing bonus'
    case 'MARKETS_CREATED':
      return 'Creation bonus'
    default:
      return 'questType'
  }
}
