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
  key: string
  amount: number
  type: string
  createdTime: number
}
type MinimalContract = Pick<
  Contract,
  'question' | 'slug' | 'visibility' | 'creatorUsername'
>
type CustomBalanceChange = Omit<BalanceChange, 'type'>

export type BetBalanceChange = CustomBalanceChange & {
  type:
    | 'create_bet'
    | 'sell_shares'
    | 'redeem_shares'
    | 'fill_bet'
    | 'loan_payment'
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
  'CREATE_CONTRACT_ANTE',
  'MANA_PAYMENT',
  'LOAN',
  'STARTING_BALANCE',
  'ADD_SUBSIDY',
]
export type TxnType = (typeof TXN_BALANCE_CHANGE_TYPES)[number]
export type TxnBalanceChange = CustomBalanceChange & {
  type: TxnType
  contract?: MinimalContract
  questType?: QuestType
  user?: Pick<User, 'username' | 'name'>
}
