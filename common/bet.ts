import { Fees } from './fees'

export type Bet = {
  id: string
  userId: string
  contractId: string

  amount: number // bet size; negative if SELL bet
  loanAmount?: number
  outcome: string
  shares: number // dynamic parimutuel pool weight or fixed ; negative if SELL bet

  probBefore: number
  probAfter: number

  sale?: {
    amount: number // amount user makes from sale
    betId: string // id of bet being sold
    // TODO: add sale time?
  }

  fees: Fees

  isSold?: boolean // true if this BUY bet has been sold
  isAnte?: boolean
  isLiquidityProvision?: boolean
  isRedemption?: boolean

  createdTime: number
}

export type NumericBet = Bet & {
  value: number
  allOutcomeShares: { [outcome: string]: number }
  allBetAmounts: { [outcome: string]: number }
}

export const MAX_LOAN_PER_CONTRACT = 20
