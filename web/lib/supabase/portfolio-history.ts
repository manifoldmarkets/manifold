import { getPortfolioHistory } from 'common/supabase/portfolio-metrics'

export type PortfolioSnapshot = Awaited<
  ReturnType<typeof getPortfolioHistory>
>[number]
