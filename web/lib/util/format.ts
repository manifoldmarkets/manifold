const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatMoney(amount: number) {
  return 'M$ ' + formatter.format(amount).substr(1)
}

export function formatWithCommas(amount: number) {
  return formatter.format(amount).substr(1)
}
