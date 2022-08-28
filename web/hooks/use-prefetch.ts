import { useUserBetContracts } from './use-contracts'
import { usePortfolioHistory } from './use-portfolio-history'
import { useUserBets } from './use-user-bets'

export function usePrefetch(userId: string | undefined) {
  const maybeUserId = userId ?? ''

  useUserBets(maybeUserId)
  useUserBetContracts(maybeUserId)
  usePortfolioHistory(maybeUserId, 'weekly')
}
