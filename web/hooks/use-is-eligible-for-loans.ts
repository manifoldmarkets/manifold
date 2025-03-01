import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { isUserEligibleForLoan } from 'common/loans'

export const useIsEligibleForLoans = (userId: string) => {
  const latestPortfolio = useCurrentPortfolio(userId)
  if (!latestPortfolio) return { latestPortfolio, isEligible: false }
  const isEligible = isUserEligibleForLoan({ ...latestPortfolio, userId })
  return { latestPortfolio, isEligible }
}
