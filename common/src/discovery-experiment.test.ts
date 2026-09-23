import {
  getDiscoveryExperimentAssignment,
  getEffectiveDiscoveryExperimentVariant,
  getDiscoveryQueryLengthBucket,
} from './discovery-experiment'

describe('discovery experiment assignment', () => {
  it('forces Gen into treatment and Manifold into control', () => {
    expect(
      getDiscoveryExperimentAssignment({
        userId: 'cA1JupYR5AR8btHUs2xvkui7jA93',
      })
    ).toEqual({ variant: 'treatment', source: 'forced' })
    expect(
      getDiscoveryExperimentAssignment({
        userId: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
      })
    ).toEqual({ variant: 'control', source: 'forced' })
  })

  it('keeps signed-in assignment stable across devices', () => {
    expect(
      getDiscoveryExperimentAssignment({
        userId: 'ordinary-user',
        deviceId: 'device-one',
      })
    ).toEqual(
      getDiscoveryExperimentAssignment({
        userId: 'ordinary-user',
        deviceId: 'device-two',
      })
    )
  })

  it('keeps frozen assignment fixtures stable', () => {
    expect(
      getDiscoveryExperimentAssignment({ userId: 'ordinary-user' })
    ).toEqual({ variant: 'treatment', source: 'user-hash' })
    expect(
      getDiscoveryExperimentAssignment({ deviceId: 'anonymous-device' })
    ).toEqual({ variant: 'control', source: 'device-hash' })
  })

  it('waits when neither identity is available', () => {
    expect(getDiscoveryExperimentAssignment({})).toBeUndefined()
  })
})

describe('effective discovery experiment variant', () => {
  it('leaves old clients in control when they omit the experiment field', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({ userId: 'ordinary-user' })
    ).toBe('control')
  })

  it('reproduces signed-in assignment instead of trusting the request', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({
        userId: 'ordinary-user',
        requestedVariant: 'control',
      })
    ).toBe('treatment')
  })

  it('enforces both forced QA assignments on the server', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({
        userId: 'cA1JupYR5AR8btHUs2xvkui7jA93',
        requestedVariant: 'control',
      })
    ).toBe('treatment')
    expect(
      getEffectiveDiscoveryExperimentVariant({
        userId: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
        requestedVariant: 'treatment',
      })
    ).toBe('control')
  })

  it('uses the device-assigned arm supplied by an anonymous client', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({
        requestedVariant: 'treatment',
      })
    ).toBe('treatment')
  })
})

describe('getDiscoveryQueryLengthBucket', () => {
  it.each([
    ['', '0'],
    ['ab', '1-2'],
    ['abc', '3-5'],
    ['sixsix', '6-15'],
    ['a'.repeat(16), '16-50'],
    ['a'.repeat(51), '51-200'],
    ['a'.repeat(201), '201+'],
  ] as const)(
    'buckets query length without retaining its text',
    (query, bucket) => {
      expect(getDiscoveryQueryLengthBucket(query)).toBe(bucket)
    }
  )
})
