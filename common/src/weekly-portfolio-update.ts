import { ContractMetric } from 'common/contract-metric'

export type WeeklyPortfolioUpdate = {
  id: string
  userId: string
  contractMetrics: ContractMetric[]
  profitPoints: { x: number; y: number }[]
  weeklyProfit: number
  rangeEndDateSlug: string // format yyyy-m-d
}

export type WeeklyPortfolioUpdateOGCardProps = {
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl: string
  weeklyProfit: string
  points: string // JSON.stringify {x:number, y:number}[]
}
