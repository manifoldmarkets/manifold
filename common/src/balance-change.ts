import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Visibility } from 'common/contract'
import { QuestType } from 'common/quest'
import { Answer } from 'common/answer'
import { AnyTxnCategory, Txn } from './txn'

export type AnyBalanceChangeType =
  | BetBalanceChange
  | TxnBalanceChange
  | PerpBalanceChange

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

// Perp ledger annotations. A liquidation moves no mana at the moment it
// happens (the margin left the balance at open), so amount is always 0 —
// the row exists so the loss is visible in the ledger on the day it became
// permanent, instead of the margin silently never coming back.
export const PERP_BALANCE_CHANGE_TYPES = ['perp_liquidation'] as const

export type PerpBalanceChange = BalanceChange & {
  type: (typeof PERP_BALANCE_CHANGE_TYPES)[number]
  contract: MinimalContract
  // Human summary, e.g. "100× short liquidated at 62,613.10 — Ṁ280,000
  // margin forfeited to the pool"
  description: string
}

export const isBetChange = (
  change: AnyBalanceChangeType
): change is BetBalanceChange =>
  BET_BALANCE_CHANGE_TYPES.includes(change.type as any)

export const isPerpChange = (
  change: AnyBalanceChangeType
): change is PerpBalanceChange =>
  PERP_BALANCE_CHANGE_TYPES.includes(change.type as any)

export const isTxnChange = (
  change: AnyBalanceChangeType
): change is TxnBalanceChange =>
  !('bet' in change) && !isPerpChange(change)

export const BALANCE_CHANGE_TYPE_LABELS: Record<
  | (typeof BET_BALANCE_CHANGE_TYPES)[number]
  | (typeof PERP_BALANCE_CHANGE_TYPES)[number]
  | AnyTxnCategory,
  string
> = {
  // Perp types
  perp_liquidation: 'Position liquidated',
  PERP_OPEN_MARGIN: 'Opened position',
  PERP_CLOSE_PAYOUT: 'Closed position',
  PERP_RESOLVE_RESIDUAL: 'Perp resolved (residual pools)',
  // Bet types
  create_bet: 'Buy shares',
  sell_shares: 'Sell shares',
  redeem_shares: 'Redeem shares',
  fill_bet: 'Fill order',
  loan_payment: 'Loan repayment',
  // Common txn types
  ADD_SUBSIDY: 'Add market subsidy',
  CHARITY_GIVEAWAY_TICKET: 'Charity giveaway ticket',
  LEAGUE_PRIZE: 'League prize',
  LOAN: 'Daily loan',
  MANA_PURCHASE: 'Mana purchase',
  MARGIN_LOAN: 'Margin loan',
  CREATE_CONTRACT_ANTE: 'Market creation ante',
  LOAN_PAYMENT: 'Loan payment',
  MEMBERSHIP_PAYMENT: 'Membership payment',
  PUSH_NOTIFICATION_BONUS: 'Push notification bonus',
  REFERRAL: 'Referral bonus',
  REMOVE_SUBSIDY: 'Remove subsidy',
  CONTRACT_RESOLUTION_PAYOUT: 'Resolution payout',
  SHOP_PURCHASE: 'Shop purchase',
  BETTING_STREAK_BONUS: 'Streak bonus',
  SWEEPSTAKES_TICKET: 'Sweepstakes ticket',
  TIP: 'Tip',
  UNIQUE_BETTOR_BONUS: 'Unique trader bonus',
  MANA_PAYMENT: 'User payment',
  QUEST_REWARD: 'Quest reward',
  // Less-common txn types
  AD_CREATE: 'Ad created',
  AD_REDEEM: 'Ad reward redeemed',
  ADMIN_REWARD: 'Admin reward',
  AIR_DROP: 'Airdrop (2024 pivot)',
  MANIFEST_AIR_DROP: 'Airdrop (2024 Manifest)',
  BOT_COMMENT_FEE: 'Bot comment fee',
  CONTRACT_BOOST_PURCHASE: 'Boost purchase',
  BOUNTY_ADDED: 'Bounty added',
  BOUNTY_AWARDED: 'Bounty awarded',
  BOUNTY_CANCELED: 'Bounty canceled',
  BOUNTY_POSTED: 'Bounty posted',
  CHARITY: 'Charity donation',
  CHARITY_FEE: 'Charity fee',
  CONSUME_SPICE: 'Redeem prize points (begin)',
  CONSUME_SPICE_DONE: 'Redeem prize points (complete)',
  CONTRACT_RESOLUTION_FEE: 'Resolution fee',
  UNDO_CONTRACT_RESOLUTION_FEE: 'Undo resolution fee',
  CONTRACT_UNDO_RESOLUTION_PAYOUT: 'Undo resolution payout',
  CONVERT_CASH: 'Convert sweepstakes cash (begin)',
  CONVERT_CASH_DONE: 'Convert sweepstakes cash (complete)',
  EXTRA_PURCHASED_MANA: 'Extra purchased mana',
  LIKE_PURCHASE: 'Like purchase',
  LOOTBOX_PURCHASE: 'Lootbox purchase',
  MANACHAN_TWEET: 'Manachan tweet',
  MANALINK: 'Manalink',
  MANIFOLD_TOP_UP: 'Manifold top-up',
  MARKET_BOOST_CREATE: 'Boost market',
  MARKET_BOOST_REDEEM: 'Claim boost',
  MARKET_BOOST_REDEEM_FEE: 'Boost redeem fee',
  PRODUCE_SPICE: 'Earn prize points',
  CONTRACT_UNDO_PRODUCE_SPICE: 'Undo prize points',
  Q_AND_A_AWARD: 'Q&A award',
  Q_AND_A_CREATE: 'Q&A created',
  QF_ADD_POOL: 'QF pool contribution',
  QF_DIVIDEND: 'QF dividend',
  QF_PAYMENT: 'QF payment',
  RECLAIM_MANA: 'Mana reclaimed',
  SHOP_REFUND: 'Shop refund',
  SIGNUP_BONUS: 'Signup bonus (initial)',
  KYC_BONUS: 'Signup bonus (verification)',
  PRE_KYC_BONUS: 'Signup bonus (backfill)',
  CASH_BONUS: 'Sweepcash bonus',
  CASH_OUT: 'Sweepcash redemption',
  SWEEPSTAKES_ENTRIES_VOIDED: 'Sweepstakes entries voided',
  CANCEL_UNIQUE_BETTOR_BONUS: 'Undo unique trader bonus',
}
