import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Visibility } from 'common/contract'
import { QuestType } from 'common/quest'
import { Answer } from 'common/answer'
import { AnyTxnCategory, Txn } from './txn'

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
  answerText?: string
}

export const isBetChange = (
  change: AnyBalanceChangeType
): change is BetBalanceChange =>
  BET_BALANCE_CHANGE_TYPES.includes(change.type as any)

export const isTxnChange = (
  change: AnyBalanceChangeType
): change is TxnBalanceChange => !('bet' in change)

export const BALANCE_CHANGE_TYPE_LABELS: Record<
  (typeof BET_BALANCE_CHANGE_TYPES)[number] | AnyTxnCategory,
  string
> = {
  // Bet types
  create_bet: 'Buy shares',
  sell_shares: 'Sell shares',
  redeem_shares: 'Redeem shares',
  fill_bet: 'Fill order',
  loan_payment: 'Loan repayment',
  // Txn types
  AD_CREATE: 'Ad created',
  AD_REDEEM: 'Ad reward redeemed',
  ADD_SUBSIDY: 'Add market subsidy',
  ADMIN_REWARD: 'Admin reward',
  AIR_DROP: 'Airdrop',
  BOT_COMMENT_FEE: 'Bot comment fee',
  CONTRACT_BOOST_PURCHASE: 'Boost purchase',
  BOUNTY_ADDED: 'Bounty added',
  BOUNTY_AWARDED: 'Bounty awarded',
  BOUNTY_CANCELED: 'Bounty canceled',
  BOUNTY_POSTED: 'Bounty posted',
  CASH_BONUS: 'Sweepstakes bonus',
  CASH_OUT: 'Cash out',
  CHARITY: 'Charity donation',
  CHARITY_FEE: 'Charity fee',
  CHARITY_GIVEAWAY_TICKET: 'Charity giveaway ticket',
  CONSUME_SPICE: 'Redeem prize points begin',
  CONSUME_SPICE_DONE: 'Redeem prize points complete',
  CONTRACT_RESOLUTION_FEE: 'Resolution fee',
  UNDO_CONTRACT_RESOLUTION_FEE: 'Undo resolution fee',
  CONTRACT_RESOLUTION_PAYOUT: 'Market resolution payout',
  CONTRACT_UNDO_PRODUCE_SPICE: 'Undo prize points',
  CONTRACT_UNDO_RESOLUTION_PAYOUT: 'Undo resolution payout',
  CONVERT_CASH: 'Convert sweepstakes cash',
  CONVERT_CASH_DONE: 'Sweepstakes cash converted',
  CREATE_CONTRACT_ANTE: 'Market creation ante',
  EXTRA_PURCHASED_MANA: 'Extra purchased mana',
  KYC_BONUS: 'KYC bonus',
  LEAGUE_PRIZE: 'League prize',
  LIKE_PURCHASE: 'Like purchase',
  LOAN: 'Loan',
  LOAN_PAYMENT: 'Loan payment',
  LOOTBOX_PURCHASE: 'Lootbox purchase',
  MANACHAN_TWEET: 'Manachan tweet',
  MANALINK: 'Manalink',
  MANA_PAYMENT: 'User payment',
  MANA_PURCHASE: 'Mana purchase',
  MANIFEST_AIR_DROP: 'Manifest airdrop',
  MANIFOLD_TOP_UP: 'Manifold top-up',
  MARGIN_LOAN: 'Margin loan',
  MARKET_BOOST_CREATE: 'Boost market',
  MARKET_BOOST_REDEEM: 'Claim boost',
  MARKET_BOOST_REDEEM_FEE: 'Boost redeem fee',
  MEMBERSHIP_PAYMENT: 'Membership payment',
  PRE_KYC_BONUS: 'Pre-KYC signup bonus',
  PRODUCE_SPICE: 'Earn prize points',
  PUSH_NOTIFICATION_BONUS: 'Push notification bonus',
  Q_AND_A_AWARD: 'Q&A award',
  Q_AND_A_CREATE: 'Q&A created',
  QF_ADD_POOL: 'QF pool contribution',
  QF_DIVIDEND: 'QF dividend',
  QF_PAYMENT: 'QF payment',
  QUEST_REWARD: 'Quest reward',
  RECLAIM_MANA: 'Mana reclaimed',
  REFERRAL: 'Referral bonus',
  REMOVE_SUBSIDY: 'Remove subsidy',
  SHOP_PURCHASE: 'Shop purchase',
  SHOP_REFUND: 'Shop refund',
  SIGNUP_BONUS: 'Signup bonus',
  BETTING_STREAK_BONUS: 'Streak bonus',
  SWEEPSTAKES_ENTRIES_VOIDED: 'Sweepstakes entries voided',
  SWEEPSTAKES_TICKET: 'Sweepstakes ticket',
  TIP: 'Tip',
  UNIQUE_BETTOR_BONUS: 'Unique trader bonus',
  CANCEL_UNIQUE_BETTOR_BONUS: 'Undo unique trader bonus',
}
