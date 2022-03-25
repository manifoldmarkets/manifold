import { ENV_CONFIG } from '../envs/constants'

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

// E.g. 1234 => "M$ 1,234"; 23456 => "M$ 23k"
export function formatMoney(amount: number) {
  let newAmount = Math.round(amount) === 0 ? 0 : amount // handle -0 case
  let suffix = ''
  if (newAmount > 10 * 1000) {
    suffix = 'k'
    newAmount /= 1000
  } else if (newAmount > 10 * 1000 * 1000) {
    suffix = 'm'
    newAmount /= 1000 * 1000
  }
  return (
    ENV_CONFIG.moneyMoniker +
    ' ' +
    formatter.format(newAmount).replace('$', '') +
    suffix
  )
}

export function formatWithCommas(amount: number) {
  return formatter.format(amount).replace('$', '')
}

export function formatPercent(zeroToOne: number) {
  // Show 1 decimal place if <2% or >98%, giving more resolution on the tails
  const decimalPlaces = zeroToOne < 0.02 || zeroToOne > 0.98 ? 1 : 0
  return (zeroToOne * 100).toFixed(decimalPlaces) + '%'
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
