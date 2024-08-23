export type PortfolioMetric = {
  balance: number
  investmentValue: number
  totalDeposits: number
}

export function getPortfolioValues(items: {
  first: PortfolioMetric | undefined
  last: PortfolioMetric
}) {
  const { first, last } = items
  const firstProfit = first
    ? first.balance + first.investmentValue - first.totalDeposits
    : 0
  const totalValue = last.balance + last.investmentValue

  const calculatedProfit = totalValue - last.totalDeposits - firstProfit

  return { firstProfit, totalValue, calculatedProfit }
}
