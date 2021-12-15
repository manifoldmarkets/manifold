const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

export function formatMoney(amount: number) {
  return 'M$ ' + formatter.format(amount).substring(1)
}

export function formatWithCommas(amount: number) {
  return formatter.format(amount).substring(1)
}

export function formatPercent(zeroToOne: number) {
  return Math.round(zeroToOne * 100) + '%'
}
