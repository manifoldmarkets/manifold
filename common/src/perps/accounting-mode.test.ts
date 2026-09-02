import {
  getPerpAccountingEpoch,
  getPerpAccountingMode,
  getPerpRiskPolicyMode,
  isAllowedPerpAccountingTransition,
  readPerpAccounting,
} from './accounting-mode'

describe('perp accounting mode', () => {
  it('defaults an absent mode to legacy and fails closed on an unknown one', () => {
    expect(getPerpAccountingMode({})).toBe('legacy')
    expect(getPerpAccountingMode({ perpAccountingMode: null })).toBe('legacy')
    expect(getPerpAccountingMode({ perpAccountingMode: 'protected' })).toBe(
      'protected'
    )
    expect(() => getPerpAccountingMode({ perpAccountingMode: 'v2' })).toThrow(
      'Unknown perp accounting mode'
    )
    expect(() =>
      getPerpAccountingMode({ perpAccountingMode: 'Protected' })
    ).toThrow()
  })

  it('validates the epoch', () => {
    expect(getPerpAccountingEpoch({})).toBe(0)
    expect(getPerpAccountingEpoch({ perpAccountingEpoch: 3 })).toBe(3)
    expect(() => getPerpAccountingEpoch({ perpAccountingEpoch: -1 })).toThrow()
    expect(() => getPerpAccountingEpoch({ perpAccountingEpoch: 1.5 })).toThrow()
    expect(() =>
      getPerpAccountingEpoch({ perpAccountingEpoch: Number.NaN })
    ).toThrow()
  })

  it('keeps risk policy independent, defaults it off, and refuses enforce in this build', () => {
    expect(getPerpRiskPolicyMode({})).toBe('off')
    expect(getPerpRiskPolicyMode({ perpRiskPolicyMode: 'shadow' })).toBe(
      'shadow'
    )
    expect(() =>
      getPerpRiskPolicyMode({ perpRiskPolicyMode: 'enforce' })
    ).toThrow('not implemented')
    expect(() => getPerpRiskPolicyMode({ perpRiskPolicyMode: 'on' })).toThrow(
      'Unknown perp risk policy mode'
    )
    // Accounting shadow says nothing about risk policy and vice versa.
    expect(
      readPerpAccounting({
        perpAccountingMode: 'shadow',
        perpAccountingEpoch: 1,
      })
    ).toEqual({
      mode: 'shadow',
      epoch: 1,
      riskPolicyMode: 'off',
    })
    expect(readPerpAccounting({ perpRiskPolicyMode: 'shadow' })).toEqual({
      mode: 'legacy',
      epoch: 0,
      riskPolicyMode: 'shadow',
    })
  })

  it('requires a positive epoch for any non-legacy mode', () => {
    expect(() =>
      readPerpAccounting({ perpAccountingMode: 'protected' })
    ).toThrow('positive accounting epoch')
    expect(() =>
      readPerpAccounting({
        perpAccountingMode: 'shadow',
        perpAccountingEpoch: 0,
      })
    ).toThrow()
  })

  it('permits only the staged transitions', () => {
    const live = { hasOpenPositions: true }
    const empty = { hasOpenPositions: false }
    expect(isAllowedPerpAccountingTransition('legacy', 'shadow', live)).toBe(
      true
    )
    expect(isAllowedPerpAccountingTransition('shadow', 'protected', live)).toBe(
      true
    )
    expect(isAllowedPerpAccountingTransition('legacy', 'protected', live)).toBe(
      false
    )
    expect(
      isAllowedPerpAccountingTransition('legacy', 'protected', empty)
    ).toBe(true)
    expect(isAllowedPerpAccountingTransition('protected', 'shadow', live)).toBe(
      false
    )
    expect(isAllowedPerpAccountingTransition('legacy', 'legacy', live)).toBe(
      false
    )
  })
})
