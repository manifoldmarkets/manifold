import { ENV_CONFIG } from '../envs/constants'
import { formatMoney, formatMoneyDisplay, formatMoneyPrecise } from './format'

// Grouping and the decimal separator follow the runtime locale (as
// formatMoney does), so pin expectations to the same Intl call with the
// digit count we expect, rather than to en-US punctuation — the suite must
// pass on a de-DE or es-ES runner too.
const fixed = (n: number, digits: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
const digits = (s: string) => s.replace(/\D/g, '')

describe('formatMoneyPrecise', () => {
  const mana = ENV_CONFIG.moneyMoniker

  it('keeps cents and groups larger values', () => {
    expect(formatMoneyPrecise(0)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(0.01)).toBe(`${mana}${fixed(0.01, 2)}`)
    expect(formatMoneyPrecise(0.02)).toBe(`${mana}${fixed(0.02, 2)}`)
    expect(formatMoneyPrecise(12.345)).toBe(`${mana}${fixed(12.35, 2)}`)
    expect(formatMoneyPrecise(1_234.5)).toBe(`${mana}${fixed(1_234.5, 2)}`)
    // Exact at every magnitude: an affordability message must never round
    // "need Ṁ100.50, have Ṁ100.25" into "need Ṁ100, have Ṁ100".
    expect(formatMoneyPrecise(100.5)).toBe(`${mana}${fixed(100.5, 2)}`)
    // Sanity on the digits themselves, separator-agnostic.
    expect(digits(formatMoneyPrecise(1_234.5))).toBe('123450')
    expect(digits(formatMoneyPrecise(12.345))).toBe('1235')
  })

  it('preserves non-zero sub-cent values at two significant digits', () => {
    expect(formatMoneyPrecise(0.009)).toBe(`${mana}${fixed(0.009, 3)}`)
    expect(formatMoneyPrecise(0.001234)).toBe(`${mana}${fixed(0.0012, 4)}`)
    expect(digits(formatMoneyPrecise(0.001234))).toBe('00012')
    // Two significant digits round up across the cent boundary cleanly.
    expect(formatMoneyPrecise(0.0099999)).toBe(`${mana}${fixed(0.01, 2)}`)
    // The smallest real fee (M$1 at 1x, 10 bps) survives.
    expect(formatMoneyPrecise(0.001)).toBe(`${mana}${fixed(0.001, 3)}`)
    expect(digits(formatMoneyPrecise(0.001))).toBe('0001')
  })

  it('reads float dust below a micro-mana as zero, never as exponent notation', () => {
    expect(formatMoneyPrecise(1e-9)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(-5e-8)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(9.9e-7)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(1e-6)).toBe(`${mana}${fixed(1e-6, 6)}`)
    expect(formatMoneyPrecise(1e-6)).not.toMatch(/e/)
  })

  it('places the sign before the moniker', () => {
    expect(formatMoneyPrecise(-0.02)).toBe(`-${mana}${fixed(0.02, 2)}`)
    expect(formatMoneyPrecise(-0.001)).toBe(`-${mana}${fixed(0.001, 3)}`)
    expect(formatMoneyPrecise(-1_234.5)).toBe(`-${mana}${fixed(1_234.5, 2)}`)
    expect(formatMoneyPrecise(-0)).toBe(`${mana}0`)
  })

  it('fails closed on non-finite values', () => {
    expect(formatMoneyPrecise(Number.NaN)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.POSITIVE_INFINITY)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.NEGATIVE_INFINITY)).toBe(`${mana}0`)
  })
})

describe('formatMoneyDisplay', () => {
  const mana = ENV_CONFIG.moneyMoniker

  it('is formatMoneyPrecise below Ṁ100', () => {
    for (const amount of [0, 0.001, 0.45, 1.1, 1.4, 12.345, 99.99, -0.45, -12.7]) {
      expect(formatMoneyDisplay(amount)).toBe(formatMoneyPrecise(amount))
    }
  })

  it('shows whole mana from Ṁ100 up, truncating toward zero like formatMoney', () => {
    expect(formatMoneyDisplay(100)).toBe(`${mana}100`)
    expect(formatMoneyDisplay(100.99)).toBe(`${mana}100`)
    expect(formatMoneyDisplay(120.345)).toBe(`${mana}120`)
    expect(digits(formatMoneyDisplay(1_234.5))).toBe('1234')
    expect(formatMoneyDisplay(1_234.5)).not.toMatch(/\d[.,]\d$/)
    // Float dust just under a whole number rounds up, as formatMoney does.
    expect(formatMoneyDisplay(499.9999999999999)).toBe(`${mana}500`)
    for (const amount of [100, 100.5, 123.45, 999.99, 1_234.5, 1e6 + 0.7]) {
      expect(digits(formatMoneyDisplay(amount))).toBe(
        digits(formatMoney(amount))
      )
    }
  })

  it('places the sign before the moniker', () => {
    expect(formatMoneyDisplay(-120.7)).toBe(`-${mana}120`)
    expect(formatMoneyDisplay(-1_234.5).startsWith(`-${mana}`)).toBe(true)
    expect(digits(formatMoneyDisplay(-1_234.5))).toBe('1234')
  })

  it('fails closed on non-finite values', () => {
    expect(formatMoneyDisplay(Number.NaN)).toBe(`${mana}0`)
    expect(formatMoneyDisplay(Number.POSITIVE_INFINITY)).toBe(`${mana}0`)
  })
})
