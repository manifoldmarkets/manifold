import {
  canEnterPerpCloseMana,
  getPerpCloseAmountError,
  perpCloseAmountFromFraction,
  perpCloseAmountFromInput,
} from './close-amount'
import { PERP_MIN_CLOSE_FRACTION, resolvePerpCloseFraction } from './amm'

describe('perp close amount selection', () => {
  it('defaults to a full close in percent mode', () => {
    expect(perpCloseAmountFromFraction(1, 'percent', 1234.567)).toEqual({
      unit: 'percent',
      input: '100',
      fraction: 1,
    })
  })

  it('sizes mana against payout, not margin or leveraged notional', () => {
    expect(perpCloseAmountFromInput('500', 'mana', 2000).fraction).toBe(0.25)
    expect(
      perpCloseAmountFromInput('33.3', 'percent', 2000).fraction
    ).toBeCloseTo(0.333, 15)
  })

  it('preserves typed decimal text', () => {
    expect(perpCloseAmountFromInput('500.00', 'mana', 2000).input).toBe(
      '500.00'
    )
  })

  it('preserves the exact portion through repeated rounded mode switches', () => {
    let selection = perpCloseAmountFromInput('500', 'mana', 1234.56789)
    const fraction = selection.fraction
    for (let i = 0; i < 100; i++) {
      selection = perpCloseAmountFromFraction(
        selection.fraction,
        'percent',
        1234.56789
      )
      expect(selection.fraction).toBe(fraction)
      selection = perpCloseAmountFromFraction(
        selection.fraction,
        'mana',
        1234.56789
      )
      expect(selection.fraction).toBe(fraction)
      expect(selection.input).toBe('500')
    }
  })

  it('does not resize a selection when the payout quote changes', () => {
    const selection = perpCloseAmountFromInput('500', 'mana', 2000)
    const switched = perpCloseAmountFromFraction(
      selection.fraction,
      'percent',
      1600
    )
    expect(switched.fraction).toBe(0.25)
    expect(switched.input).toBe('25')
    expect(
      perpCloseAmountFromFraction(switched.fraction, 'mana', 1600).input
    ).toBe('400')
    // Editing the mana field again sizes the new request at the new quote.
    expect(perpCloseAmountFromInput('500', 'mana', 1600).fraction).toBe(0.3125)
  })

  it('keeps Max exactly full even when its displayed payout is rounded', () => {
    const selection = perpCloseAmountFromFraction(1, 'mana', 1234.56789)
    expect(selection.input).toBe('1234.57')
    expect(selection.fraction).toBe(1)
    expect(getPerpCloseAmountError(selection, 1200)).toBeNull()
    expect(
      perpCloseAmountFromFraction(selection.fraction, 'percent', 1200).input
    ).toBe('100')
  })

  it('does not round a genuine partial selection to 100%', () => {
    const selection = perpCloseAmountFromFraction(0.9999999, 'percent', 1000)
    expect(selection.input).toBe('99.99')
    expect(selection.fraction).toBe(0.9999999)
  })

  it('keeps the minimum valid without rounding the selected portion', () => {
    for (const payout of [0.00001, 0.017, 1.13, 27.13, 1234.56789, 1e10]) {
      const selection = perpCloseAmountFromInput(
        String(payout * PERP_MIN_CLOSE_FRACTION),
        'mana',
        payout
      )
      expect(selection.fraction).toBe(PERP_MIN_CLOSE_FRACTION)
      expect(getPerpCloseAmountError(selection, payout)).toBeNull()
      const converted = perpCloseAmountFromFraction(
        selection.fraction,
        'mana',
        payout
      )
      expect(Number(converted.input)).toBeGreaterThan(0)
      expect(getPerpCloseAmountError(converted, payout)).toBeNull()
    }
  })

  it.each(['', ' ', 'NaN', 'Infinity', '1e999'])(
    'rejects non-finite or missing input %p',
    (input) => {
      for (const unit of ['percent', 'mana'] as const)
        expect(
          getPerpCloseAmountError(
            perpCloseAmountFromInput(input, unit, 1000),
            1000
          )
        ).toBe('missing')
    }
  )

  it.each(['0', '-1', '0.999'])(
    'does not silently clamp too-small percentages %p',
    (input) => {
      expect(
        getPerpCloseAmountError(
          perpCloseAmountFromInput(input, 'percent', 1000),
          1000
        )
      ).toBe('below-minimum')
    }
  )

  it('rejects mana below the 1% floor and above the available payout', () => {
    expect(
      getPerpCloseAmountError(
        perpCloseAmountFromInput('9.99', 'mana', 1000),
        1000
      )
    ).toBe('below-minimum')
    expect(
      getPerpCloseAmountError(
        perpCloseAmountFromInput('1000.01', 'mana', 1000),
        1000
      )
    ).toBe('above-maximum')
    expect(
      getPerpCloseAmountError(
        perpCloseAmountFromInput('100.01', 'percent', 1000),
        1000
      )
    ).toBe('above-maximum')
  })

  it.each([0, -1, NaN, Infinity])(
    'keeps percent closes available when mana cannot be sized (%p)',
    (payout) => {
      expect(canEnterPerpCloseMana(payout)).toBe(false)
      expect(
        getPerpCloseAmountError(
          perpCloseAmountFromInput('1', 'mana', payout),
          payout
        )
      ).toBe('unavailable')
      expect(
        getPerpCloseAmountError(
          perpCloseAmountFromInput('100', 'percent', payout),
          payout
        )
      ).toBeNull()
    }
  )

  it('keeps empty selections empty when switching modes', () => {
    const selection = perpCloseAmountFromInput('', 'mana', 1000)
    expect(
      perpCloseAmountFromFraction(selection.fraction, 'percent', 1000)
    ).toEqual({
      unit: 'percent',
      input: '',
      fraction: null,
    })
  })

  it('does not disguise invalid input as a valid boundary on a unit switch', () => {
    for (const amount of ['9.99', '1000.001']) {
      const selection = perpCloseAmountFromInput(amount, 'mana', 1000)
      const converted = perpCloseAmountFromFraction(
        selection.fraction,
        'percent',
        1000
      )
      expect(Number(converted.input)).not.toBe(1)
      expect(Number(converted.input)).not.toBe(100)
      expect(getPerpCloseAmountError(converted, 1000)).toBe(
        getPerpCloseAmountError(selection, 1000)
      )
    }
  })

  it('leaves remainder-dust promotion to the same engine preview', () => {
    const selection = perpCloseAmountFromInput('0.999', 'mana', 1)
    expect(selection.fraction).toBe(0.999)
    expect(
      resolvePerpCloseFraction({ size: 3, costBasis: 1 }, selection.fraction!)
    ).toBe(1)
  })
})
