const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const formatMoney = (amount: number) => {
  return 'M$ ' + formatter.format(amount).substr(1)
}
