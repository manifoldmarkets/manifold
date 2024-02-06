import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import { QuestType } from 'common/quest'
import { Answer } from 'common/answer'
export type AnyBalanceChangeType =
  | BalanceChange
  | BetBalanceChange
  | TxnBalanceChange

export type BalanceChange = {
  amount: number
  type: // users
  | 'managram'
    | 'manalink'
    // contracts
    | 'create_contract_ante'
    | 'subsidize_contract'
    | 'contract_payout'
    // bonuses
    | 'create_contract_quest_bonus'
    | 'contract_unique_trader_bonus'
    | 'prediction_bonus'
    | 'share_bonus'

  user?: Pick<User, 'username'>

  createdTime: number
}
type MinimalContract = Pick<Contract, 'question' | 'slug' | 'visibility'>
type CustomBalanceChange = Omit<BalanceChange, 'type'>

export type BetBalanceChange = CustomBalanceChange & {
  type: 'create_bet' | 'sell_shares' | 'redeem_shares'
  bet: Pick<Bet, 'outcome' | 'shares'>
  answer: Pick<Answer, 'text' | 'id'> | undefined
  contract: MinimalContract
}
export const TXN_BALANCE_CHANGE_TYPES = [
  'UNIQUE_BETTOR_BONUS',
  'BETTING_STREAK_BONUS',
  'SIGNUP_BONUS',
  'CONTRACT_RESOLUTION_PAYOUT',
  'CONTRACT_UNDO_RESOLUTION_PAYOUT',
  'MARKET_BOOST_REDEEM',
  'MARKET_BOOST_CREATE',
  'QUEST_REWARD',
  'LEAGUE_PRIZE',
  'BOUNTY_POSTED',
  'BOUNTY_AWARDED',
  'MANA_PAYMENT',
  'LOAN',
]
export type TxnType = (typeof TXN_BALANCE_CHANGE_TYPES)[number]
export type TxnBalanceChange = CustomBalanceChange & {
  type: TxnType
  contract: MinimalContract
  questType?: QuestType
  user?: Pick<User, 'username' | 'name'>
}
