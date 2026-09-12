import { Bet } from './bet'
import { Contract } from './contract'
import { versusSide, versusSideProb } from './versus'

/** Price shown on a share card; limit mode falls back to the fill average. */
export const getBetSharePrice = (
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  bet: Pick<Bet, 'answerId' | 'outcome' | 'amount' | 'shares' | 'limitProb'>,
  priceType: 'average' | 'limit'
) => {
  const side = versusSide(contract, bet)
  if (priceType === 'limit' && bet.limitProb !== undefined)
    return side ? versusSideProb(bet.outcome, bet.limitProb) : bet.limitProb

  // Shares and amount already refer to the position bought (or sold), so
  // their ratio is the price of the backed answer on a versus card.
  const average = bet.amount / bet.shares
  return side || bet.outcome === 'YES' ? average : 1 - average
}
