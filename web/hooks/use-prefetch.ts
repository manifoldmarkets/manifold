import { prefetchUserBetContracts } from './use-contracts'
import { prefetchPortfolioHistory } from './use-portfolio-history'
import { prefetchUserBets } from './use-user-bets'

export function usePrefetch(userId: string | undefined) {
  const maybeUserId = userId ?? ''

  prefetchUserBets(maybeUserId)
  prefetchUserBetContracts(maybeUserId)
  prefetchPortfolioHistory(maybeUserId, 'weekly')
}
