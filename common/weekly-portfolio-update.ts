import { ContractMetric } from 'common/contract-metric'
import { PortfolioMetrics } from 'common/user'

export type WeeklyPortfolioUpdate = {
  id: string
  userId: string
  rank: number
  contractMetrics: ContractMetric[]
  portfolioMetrics: PortfolioMetrics[]
  weeklyProfit: number
  rangeEndDate: string // format yyyy-m-d
}
