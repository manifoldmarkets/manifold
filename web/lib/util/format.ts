const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

export function formatMoney(amount: number) {
  return 'M$ ' + formatter.format(amount).replace('$', '')
}

export function formatWithCommas(amount: number) {
  return formatter.format(amount).replace('$', '')
}

export function formatPercent(zeroToOne: number) {
  return Math.round(zeroToOne * 100) + '%'
}

export function toCamelCase(words: string) {
  return words
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word)
    .map((word, index) =>
      index === 0 ? word : word[0].toLocaleUpperCase() + word.substring(1)
    )
    .join('')
}
