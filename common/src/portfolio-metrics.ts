export type PortfolioMetrics = {
  investmentValue: number
  balance: number
  spiceBalance: number
  totalDeposits: number
  loanTotal: number
  timestamp: number
  profit?: number
}
export type LivePortfolioMetrics = PortfolioMetrics & {
  dailyProfit: number
}
