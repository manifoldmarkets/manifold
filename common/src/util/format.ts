import { ENV_CONFIG } from '../envs/constants'
import { ContractToken, MarketContract } from 'common/contract'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { floatingEqual } from './math'

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

const formatterWithFraction = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

export const SWEEPIES_MONIKER = '𝕊'

export type InputTokenType = 'M$' | 'SPICE' | 'CASH' | 'MANA'

export function formatWithToken(variables: {
  amount: number
  token: InputTokenType
  toDecimal?: number
  short?: boolean
}) {
  const { amount, token, toDecimal, short } = variables
  if (token === 'CASH') {
    return formatSweepies(amount, { toDecimal, short })
  }
  if (toDecimal) {
    return formatMoneyWithDecimals(amount)
  }
  if (short) {
    return formatMoneyShort(amount)
  }
  return formatMoney(amount)
}

export function formatMoney(amount: number, token?: ContractToken) {
  if (token === 'CASH') {
    return formatSweepies(amount)
  }
  const newAmount = getMoneyNumber(amount)
  return `${ENV_CONFIG.moneyMoniker}${formatNumber(newAmount)}`
}

export function formatMoneyNoMoniker(amount: number) {
  const newAmount = getMoneyNumber(amount)
  return formatNumber(newAmount)
}

export function formatSweepies(
  amount: number,
  parameters?: {
    toDecimal?: number
    short?: boolean
  }
) {
  const numberText = formatSweepiesNumber(amount, parameters)
  const negative = numberText.startsWith('-')

  return (negative ? '-' : '') + SWEEPIES_MONIKER + numberText.replace('-', '')
}

export function formatSweepiesNumber(
  amount: number,
  parameters?: {
    toDecimal?: number
    short?: boolean
  }
) {
  const { toDecimal, short } = parameters ?? {}
  if (short) {
    return formatLargeNumber(amount)
  }
  const toDecimalPlace = toDecimal ?? 2
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: toDecimalPlace,
    maximumFractionDigits: toDecimalPlace,
  })
}

export function formatSpice(amount: number) {
  const newAmount = getMoneyNumber(amount)
  return formatter.format(newAmount).replace('$', 'P ')
}

export function formatMoneyShort(amount: number) {
  const newAmount = getMoneyNumber(amount)
  return ENV_CONFIG.moneyMoniker + formatLargeNumber(newAmount)
}

export function formatMoneyUSD(amount: number, fraction?: boolean) {
  if (fraction) {
    return formatterWithFraction.format(amount)
  }
  const newAmount = getMoneyNumber(amount)
  return formatter.format(newAmount)
}

export function formatSweepsToUSD(amount: number) {
  return formatterWithFraction.format(amount)
}

export function formatMoneyNumberUSLocale(amount: number) {
  const newAmount = getMoneyNumber(amount)
  return formatter.format(newAmount).replace('$', '')
}

export function formatMoneyNumber(amount: number) {
  const newAmount = getMoneyNumber(amount)
  return formatNumber(newAmount)
}

export function getMoneyNumber(amount: number) {
  // Handle 499.9999999999999 case
  const plusEpsilon = (amount > 0 ? Math.floor : Math.ceil)(
    amount + 0.00000000001 * Math.sign(amount)
  )
  return Math.round(plusEpsilon) === 0 ? 0 : plusEpsilon
}

export function getMoneyNumberToDecimal(amount: number) {
  return Math.abs(amount - Math.round(amount)) < 0.0001
    ? Math.round(amount).toFixed(0)
    : amount.toFixed(1)
}

export function formatMoneyWithDecimals(amount: number) {
  return ENV_CONFIG.moneyMoniker + amount.toFixed(2)
}

export function formatMoneyToDecimal(amount: number) {
  return ENV_CONFIG.moneyMoniker + getMoneyNumberToDecimal(amount)
}

export function formatWithCommas(amount: number) {
  return formatNumber(Math.floor(amount))
}

export function formatShares(amount: number, isCashContract: boolean) {
  if (isCashContract) {
    // Format with locale, but ensure 2 decimal places
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  } else {
    return formatWithCommas(getMoneyNumber(amount))
  }
}

export function formatPercentShort(zeroToOne: number) {
  return getPercent(zeroToOne).toFixed(0) + '%'
}

export function getPercent(zeroToOne: number) {
  return Math.min(zeroToOne * 100, 99)
}

function getPercentDecimalPlaces(zeroToOne: number) {
  return zeroToOne < 0.02 || zeroToOne > 0.98 ? 1 : 0
}

export function formatPercent(zeroToOne: number) {
  // Show 1 decimal place if <2% or >98%, giving more resolution on the tails
  const decimalPlaces = getPercentDecimalPlaces(zeroToOne)
  const percent = zeroToOne * 100
  return percent.toFixed(decimalPlaces) + '%'
}

export function formatPercentNumber(zeroToOne: number) {
  // Show 1 decimal place if <2% or >98%, giving more resolution on the tails
  const decimalPlaces = getPercentDecimalPlaces(zeroToOne)
  return Number((zeroToOne * 100).toFixed(decimalPlaces))
}

const showPrecision = (x: number, sigfigs: number) =>
  // convert back to number for weird formatting reason
  `${Number(x.toPrecision(sigfigs))}`

// Eg 1234567.89 => 1.23M; 5678 => 5.68K
export function formatLargeNumber(num: number, sigfigs = 2): string {
  const absNum = Math.abs(num)
  if (floatingEqual(absNum, 0)) return '0'
  if (absNum < 0.1) return showPrecision(num, 1)
  if (absNum < 1) return showPrecision(num, sigfigs)

  if (absNum < 100) return showPrecision(num, 2)
  if (absNum < 1000) return showPrecision(num, 3)
  if (absNum < 10000) return showPrecision(num, 4)

  const suffix = ['', 'k', 'm', 'b', 't', 'q']
  const i = Math.floor(Math.log10(absNum) / 3)

  const numStr = showPrecision(num / Math.pow(10, 3 * i), sigfigs)
  return `${numStr}${suffix[i] ?? ''}`
}

export function shortFormatNumber(num: number): string {
  if (floatingEqual(num, 0)) return '0'
  if (num < 10 && num > -10) return showPrecision(num, 1)
  if (num < 100 && num > -100) return showPrecision(num, 2)
  if (num < 1000 && num > -1000) return showPrecision(num, 3)

  const suffix = ['', 'k', 'm', 'b', 't', 'q']
  const i = Math.floor(Math.log10(Math.abs(num)) / 3)

  const numStr = showPrecision(num / Math.pow(10, 3 * i), 2)
  return `${numStr}${suffix[i] ?? ''}`
}

export function maybePluralize(
  word: string,
  num: number,
  plural: string = 's'
): string {
  return num === 1 ? word : word + plural
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

export const formatOutcomeLabel = (
  contract: MarketContract,
  outcomeLabel: 'YES' | 'NO',
  outcomePseudonym?: string
) => {
  if (outcomePseudonym) {
    return outcomePseudonym
  }
  if (
    contract.outcomeType === 'BINARY' ||
    contract.mechanism === 'cpmm-multi-1'
  ) {
    return outcomeLabel
  }
  if (contract.outcomeType === 'STONK') {
    return outcomeLabel === 'YES' ? STONK_YES : STONK_NO
  }
  return outcomeLabel === 'YES' ? 'HIGHER' : 'LOWER'
}

export function formatNumber(
  amount: number,
  options?: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
  }
) {
  // Use toLocaleString - it uses Intl.NumberFormat internally and respects locale
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  })
}
