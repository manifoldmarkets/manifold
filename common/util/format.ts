import { ENV_CONFIG } from '../envs/constants'

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

export function formatMoney(amount: number) {
  const newAmount = Math.round(amount) === 0 ? 0 : amount // handle -0 case
  return (
    ENV_CONFIG.moneyMoniker + ' ' + formatter.format(newAmount).replace('$', '')
  )
}

export function formatWithCommas(amount: number) {
  return formatter.format(amount).replace('$', '')
}

const decimalPlaces = (x: number) => Math.ceil(-Math.log10(x)) - 2

export function formatPercent(decimalPercent: number) {
  const displayedFigs =
    (decimalPercent >= 0.02 && decimalPercent <= 0.98) ||
    decimalPercent <= 0 ||
    decimalPercent >= 1
      ? 0
      : Math.max(
          decimalPlaces(decimalPercent),
          decimalPlaces(1 - decimalPercent)
        )

  return (decimalPercent * 100).toFixed(displayedFigs) + '%'
}

export function toCamelCase(words: string) {
  const camelCase = words
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word)
    .map((word, index) =>
      index === 0 ? word : word[0].toLocaleUpperCase() + word.substring(1)
    )
    .join('')

  // Remove non-alpha-numeric-underscore chars.
  const regex = /(?:^|\s)(?:[a-z0-9_]+)/gi
  return (camelCase.match(regex) || [])[0] ?? ''
}
