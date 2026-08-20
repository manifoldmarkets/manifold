import { ENV_CONFIG } from '../envs/constants'
import { formatMoneyPrecise } from './format'

describe('formatMoneyPrecise', () => {
  const mana = ENV_CONFIG.moneyMoniker

  it('keeps cents and groups larger values', () => {
    expect(formatMoneyPrecise(0)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(0.01)).toBe(`${mana}0.01`)
    expect(formatMoneyPrecise(0.02)).toBe(`${mana}0.02`)
    expect(formatMoneyPrecise(12.345)).toBe(`${mana}12.35`)
    expect(formatMoneyPrecise(1_234.5)).toBe(`${mana}1,234.50`)
  })

  it('preserves non-zero sub-cent values', () => {
    expect(formatMoneyPrecise(0.009)).toBe(`${mana}0.009`)
    expect(formatMoneyPrecise(0.001234)).toBe(`${mana}0.0012`)
    expect(formatMoneyPrecise(1e-9)).toBe(`${mana}1e-9`)
  })

  it('places the sign before the moniker', () => {
    expect(formatMoneyPrecise(-0.02)).toBe(`-${mana}0.02`)
    expect(formatMoneyPrecise(-0.001)).toBe(`-${mana}0.001`)
  })

  it('fails closed on non-finite values', () => {
    expect(formatMoneyPrecise(Number.NaN)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.POSITIVE_INFINITY)).toBe(`${mana}0`)
    expect(formatMoneyPrecise(Number.NEGATIVE_INFINITY)).toBe(`${mana}0`)
  })
})
