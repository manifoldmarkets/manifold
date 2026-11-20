import {
  AB_TEST_ACCOUNT_OVERRIDES,
  canLogABTestExposure,
  getDeterministicABTestVariant,
  getForcedABTestVariant,
} from './ab-test'

const variants = ['control', 'treatment'] as const

describe('A/B test assignment', () => {
  it('keeps the designated QA accounts in opposite variants', () => {
    expect(
      getForcedABTestVariant('cA1JupYR5AR8btHUs2xvkui7jA93', variants)
    ).toBe('treatment')
    expect(
      getForcedABTestVariant('IPTOzEqrpkWmEzh6hwvAyY9PqFb2', variants)
    ).toBe('control')
  })

  it('does not force accounts when an experiment uses other variant names', () => {
    expect(
      getForcedABTestVariant('cA1JupYR5AR8btHUs2xvkui7jA93', ['a', 'b'])
    ).toBeUndefined()
  })

  it('is stable and independent of caller variant order', () => {
    const first = getDeterministicABTestVariant('test-v1', 'user:abc', variants)
    const second = getDeterministicABTestVariant(
      'test-v1',
      'user:abc',
      [...variants].reverse()
    )

    expect(second).toBe(first)
  })

  it('honors a valid forced variant', () => {
    expect(
      getDeterministicABTestVariant(
        'test-v1',
        'user:abc',
        variants,
        'treatment'
      )
    ).toBe('treatment')
  })

  it('fails closed on an empty experiment', () => {
    expect(() =>
      getDeterministicABTestVariant('test-v1', 'user:abc', [])
    ).toThrow('must have at least one variant')
  })

  it('exports only the intended permanent overrides', () => {
    expect(AB_TEST_ACCOUNT_OVERRIDES).toEqual({
      cA1JupYR5AR8btHUs2xvkui7jA93: 'treatment',
      IPTOzEqrpkWmEzh6hwvAyY9PqFb2: 'control',
    })
  })
})

describe('A/B test exposure logging', () => {
  it('logs a user unit only while that user is signed in', () => {
    expect(canLogABTestExposure('user', 'abc', 'abc')).toBe(true)
    // Account switched, or signed out, since the assignment was made.
    expect(canLogABTestExposure('user', 'abc', 'xyz')).toBe(false)
    expect(canLogABTestExposure('user', 'abc', undefined)).toBe(false)
  })

  it('logs a device unit whoever is signed in', () => {
    expect(canLogABTestExposure('device', 'tok', undefined)).toBe(true)
    // A device-assigned test still counts signed-in visitors.
    expect(canLogABTestExposure('device', 'tok', 'abc')).toBe(true)
  })
})
