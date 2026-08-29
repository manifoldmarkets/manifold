import { ENV_CONFIG } from '../envs/constants'
import {
  formatMoney,
  formatMoneyOrLessThanOne,
  formatMoneyPrecise,
} from './format'

describe('formatMoneyOrLessThanOne', () => {
  const mana = ENV_CONFIG.moneyMoniker

  it('reads a real sub-mana amount as "<Ṁ1", not "Ṁ0"', () => {
    expect(formatMoneyOrLessThanOne(0.45)).toBe(`<${mana}1`)
    expect(formatMoneyOrLessThanOne(0.001)).toBe(`<${mana}1`)
    expect(formatMoneyOrLessThanOne(-0.45)).toBe(`<${mana}1`)
  })

  it('otherwise matches formatMoneyPrecise on the magnitude', () => {
    expect(formatMoneyOrLessThanOne(0)).toBe(`${mana}0`)
    expect(formatMoneyOrLessThanOne(1e-9)).toBe(`${mana}0`)
    expect(formatMoneyOrLessThanOne(1)).toBe(`${mana}1`)
    expect(formatMoneyOrLessThanOne(12.7)).toBe(`${mana}12`)
    expect(formatMoneyOrLessThanOne(-12.7)).toBe(`${mana}12`)
    expect(formatMoneyOrLessThanOne(Number.NaN)).toBe(`${mana}0`)
  })
})

describe('formatMoneyPrecise', () => {
  const mana = ENV_CONFIG.moneyMoniker
  // Grouping follows the runtime locale (as formatMoney does), so compare
  // digits separator-agnostically rather than pinning en-US punctuation —
  // the suite must pass on a de-DE or es-ES runner too.
  const digits = (s: string) => s.replace(/\D/g, '')

  it('shows whole mana only, truncating toward zero like formatMoney', () => {
    expect(formatMoneyPrecise(0)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(12)).toBe(`${mana}12`)
    expect(formatMoneyPrecise(12.345)).toBe(`${mana}12`)
    expect(formatMoneyPrecise(12.99)).toBe(`${mana}12`)
    expect(digits(formatMoneyPrecise(1_234.5))).toBe('1234')
    expect(formatMoneyPrecise(1_234.5)).not.toMatch(/\d[.,]\d$/)
    // Float dust just under a whole number rounds up, as formatMoney does.
    expect(formatMoneyPrecise(499.9999999999999)).toBe(`${mana}500`)
  })

  it('agrees with formatMoney on the digits for every magnitude', () => {
    for (const amount of [0, 0.4, 1, 1.5, 12.345, 999.99, 1_234.5, 1e6 + 0.7]) {
      expect(digits(formatMoneyPrecise(amount))).toBe(
        digits(formatMoney(amount))
      )
    }
  })

  it('reads sub-mana amounts as zero, never as a fraction or exponent', () => {
    expect(formatMoneyPrecise(0.5)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(0.999)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(0.001)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(1e-9)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(1e-6)).not.toMatch(/e/)
  })

  it('places the sign before the moniker and never shows -0', () => {
    expect(formatMoneyPrecise(-12.7)).toBe(`-${mana}12`)
    expect(formatMoneyPrecise(-1_234.5).startsWith(`-${mana}`)).toBe(true)
    expect(digits(formatMoneyPrecise(-1_234.5))).toBe('1234')
    expect(formatMoneyPrecise(-0.4)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(-5e-8)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(-0)).toBe(`${mana}0`)
  })

  it('fails closed on non-finite values', () => {
    expect(formatMoneyPrecise(Number.NaN)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.POSITIVE_INFINITY)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.NEGATIVE_INFINITY)).toBe(`${mana}0`)
  })
})
