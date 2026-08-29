import { ENV_CONFIG } from '../envs/constants'
import { formatMoney, formatMoneyPrecise } from './format'

describe('formatMoneyPrecise', () => {
  const mana = ENV_CONFIG.moneyMoniker
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

  it('shows whole mana from Ṁ1 up, truncating toward zero like formatMoney', () => {
    expect(formatMoneyPrecise(1)).toBe(`${mana}1`)
    expect(formatMoneyPrecise(12)).toBe(`${mana}12`)
    expect(formatMoneyPrecise(12.345)).toBe(`${mana}12`)
    expect(formatMoneyPrecise(12.99)).toBe(`${mana}12`)
    expect(digits(formatMoneyPrecise(1_234.5))).toBe('1234')
    expect(formatMoneyPrecise(1_234.5)).not.toMatch(/\d[.,]\d$/)
    // Float dust just under a whole number rounds up, as formatMoney does.
    expect(formatMoneyPrecise(499.9999999999999)).toBe(`${mana}500`)
  })

  it('agrees with formatMoney on the digits from Ṁ1 up', () => {
    for (const amount of [1, 1.5, 12.345, 999.99, 1_234.5, 1e6 + 0.7]) {
      expect(digits(formatMoneyPrecise(amount))).toBe(
        digits(formatMoney(amount))
      )
    }
  })

  it('keeps cents below Ṁ1', () => {
    expect(formatMoneyPrecise(0.9)).toBe(`${mana}${fixed(0.9, 2)}`)
    expect(formatMoneyPrecise(0.45)).toBe(`${mana}${fixed(0.45, 2)}`)
    expect(formatMoneyPrecise(0.1)).toBe(`${mana}${fixed(0.1, 2)}`)
    expect(formatMoneyPrecise(0.01)).toBe(`${mana}${fixed(0.01, 2)}`)
    expect(formatMoneyPrecise(0.456).replace(/\D/g, '')).toBe('046')
  })

  it('preserves non-zero sub-cent values at two significant digits', () => {
    expect(formatMoneyPrecise(0.009)).toBe(`${mana}${fixed(0.009, 3)}`)
    expect(formatMoneyPrecise(0.001234)).toBe(`${mana}${fixed(0.0012, 4)}`)
    expect(formatMoneyPrecise(0.001234).replace(/\D/g, '')).toBe('00012')
    // Two significant digits round up across the cent boundary cleanly.
    expect(formatMoneyPrecise(0.0099999)).toBe(`${mana}${fixed(0.01, 2)}`)
    // The smallest real fee (M$1 at 1x, 10 bps) survives.
    expect(formatMoneyPrecise(0.001)).toBe(`${mana}${fixed(0.001, 3)}`)
  })

  it('reads float dust below a micro-mana as zero, never as exponent notation', () => {
    expect(formatMoneyPrecise(0)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(1e-9)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(-5e-8)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(9.9e-7)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(1e-6)).toBe(`${mana}${fixed(1e-6, 6)}`)
    expect(formatMoneyPrecise(1e-6)).not.toMatch(/e/)
  })

  it('places the sign before the moniker and never shows -0', () => {
    expect(formatMoneyPrecise(-12.7)).toBe(`-${mana}12`)
    expect(formatMoneyPrecise(-1_234.5).startsWith(`-${mana}`)).toBe(true)
    expect(digits(formatMoneyPrecise(-1_234.5))).toBe('1234')
    expect(formatMoneyPrecise(-0.45)).toBe(`-${mana}${fixed(0.45, 2)}`)
    expect(formatMoneyPrecise(-0.001)).toBe(`-${mana}${fixed(0.001, 3)}`)
    expect(formatMoneyPrecise(-0)).toBe(`${mana}0`)
  })

  it('fails closed on non-finite values', () => {
    expect(formatMoneyPrecise(Number.NaN)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.POSITIVE_INFINITY)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.NEGATIVE_INFINITY)).toBe(`${mana}0`)
  })
})
