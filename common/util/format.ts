import { ENV_CONFIG } from '../envs/constants'

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

export function formatMoney(amount: number) {
  const formattedNumber = getMoneyNumber(amount)
  if (formattedNumber < 0) {
    return (
      '-' +
      ENV_CONFIG.moneyMoniker +
      formatter.format(Math.abs(formattedNumber)).replace('$', '')
    )
  }
  return (
    ENV_CONFIG.moneyMoniker + formatter.format(formattedNumber).replace('$', '')
  )
}

export function formatMoneyNumber(amount: number) {
  const newAmount = getMoneyNumber(amount)
  return formatter.format(newAmount).replace('$', '')
}

export function getMoneyNumber(amount: number) {
  return Math.round(amount) === 0
    ? 0
    : // Handle 499.9999999999999 case
      (amount > 0 ? Math.floor : Math.ceil)(
        amount + 0.00000000001 * Math.sign(amount)
      )
}

export function formatMoneyWithDecimals(amount: number) {
  return ENV_CONFIG.moneyMoniker + amount.toFixed(2)
}

export function formatWithCommas(amount: number) {
  return formatter.format(Math.floor(amount)).replace('$', '')
}

export function manaToUSD(mana: number) {
  return (mana / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export function formatPercent(zeroToOne: number) {
  // Show 1 decimal place if <2% or >98%, giving more resolution on the tails
  const decimalPlaces = zeroToOne < 0.02 || zeroToOne > 0.98 ? 1 : 0
  return (zeroToOne * 100).toFixed(decimalPlaces) + '%'
}

const showPrecision = (x: number, sigfigs: number) =>
  // convert back to number for weird formatting reason
  `${Number(x.toPrecision(sigfigs))}`

// Eg 1234567.89 => 1.23M; 5678 => 5.68K
export function formatLargeNumber(num: number, sigfigs = 2): string {
  const absNum = Math.abs(num)
  if (absNum < 1) return showPrecision(num, sigfigs)

  if (absNum < 100) return showPrecision(num, 2)
  if (absNum < 1000) return showPrecision(num, 3)
  if (absNum < 10000) return showPrecision(num, 4)

  const suffix = ['', 'K', 'M', 'B', 'T', 'Q']
  const i = Math.floor(Math.log10(absNum) / 3)

  const numStr = showPrecision(num / Math.pow(10, 3 * i), sigfigs)
  return `${numStr}${suffix[i] ?? ''}`
}

export function shortFormatNumber(num: number): string {
  if (num < 1000) return showPrecision(num, 3)

  const suffix = ['', 'K', 'M', 'B', 'T', 'Q']
  const i = Math.floor(Math.log10(num) / 3)

  const numStr = showPrecision(num / Math.pow(10, 3 * i), 2)
  return `${numStr}${suffix[i] ?? ''}`
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
