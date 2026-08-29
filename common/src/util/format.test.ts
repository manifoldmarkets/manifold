import { ENV_CONFIG } from '../envs/constants'
import { formatMoneyPrecise } from './format'

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

  it('keeps cents and groups larger values', () => {
    expect(formatMoneyPrecise(0)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(0.01)).toBe(`${mana}${fixed(0.01, 2)}`)
    expect(formatMoneyPrecise(0.02)).toBe(`${mana}${fixed(0.02, 2)}`)
    expect(formatMoneyPrecise(12.345)).toBe(`${mana}${fixed(12.35, 2)}`)
    expect(formatMoneyPrecise(1_234.5)).toBe(`${mana}${fixed(1_234.5, 2)}`)
    // Sanity on the digits themselves, separator-agnostic.
    expect(formatMoneyPrecise(1_234.5).replace(/\D/g, '')).toBe('123450')
    expect(formatMoneyPrecise(12.345).replace(/\D/g, '')).toBe('1235')
  })

  it('preserves non-zero sub-cent values at two significant digits', () => {
    expect(formatMoneyPrecise(0.009)).toBe(`${mana}${fixed(0.009, 3)}`)
    expect(formatMoneyPrecise(0.001234)).toBe(`${mana}${fixed(0.0012, 4)}`)
    expect(formatMoneyPrecise(0.001234).replace(/\D/g, '')).toBe('00012')
    // Two significant digits round up across the cent boundary cleanly.
    expect(formatMoneyPrecise(0.0099999)).toBe(`${mana}${fixed(0.01, 2)}`)
    // The smallest real fee (M$1 at 1x, 10 bps) survives.
    expect(formatMoneyPrecise(0.001)).toBe(`${mana}${fixed(0.001, 3)}`)
    expect(formatMoneyPrecise(0.001).replace(/\D/g, '')).toBe('0001')
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
