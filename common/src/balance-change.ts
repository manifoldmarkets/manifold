import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Contract } from 'common/contract'
export type AnyBalanceChangeType = BalanceChange | BetBalanceChange

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
type CustomBalanceChange = Omit<BalanceChange, 'type'>

export type BetBalanceChange = CustomBalanceChange & {
  type: 'create_bet' | 'sell_shares'
  bet: Pick<Bet, 'outcome' | 'shares' | 'isRedemption'>
  contract: Pick<Contract, 'question' | 'slug' | 'visibility'>
}
