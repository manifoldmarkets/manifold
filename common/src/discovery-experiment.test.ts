import {
  DISCOVERY_EXPERIMENT_ACTIVE_VARIANTS,
  getDiscoveryExperimentAssignment,
  getEffectiveDiscoveryExperimentVariant,
  getDiscoveryQueryLengthBucket,
} from './discovery-experiment'

describe('discovery experiment assignment after the experiment concluded', () => {
  it('puts the former QA accounts in control like everyone else', () => {
    expect(
      getDiscoveryExperimentAssignment({
        userId: 'cA1JupYR5AR8btHUs2xvkui7jA93',
      })
    ).toEqual({ variant: 'control', source: 'user-hash' })
    expect(
      getDiscoveryExperimentAssignment({
        userId: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
      })
    ).toEqual({ variant: 'control', source: 'user-hash' })
  })

  it('puts signed-in users in control regardless of device', () => {
    // 'ordinary-user' hashed into treatment while the experiment ran.
    expect(
      getDiscoveryExperimentAssignment({
        userId: 'ordinary-user',
        deviceId: 'device-one',
      })
    ).toEqual({ variant: 'control', source: 'user-hash' })
    expect(
      getDiscoveryExperimentAssignment({
        userId: 'ordinary-user',
        deviceId: 'device-two',
      })
    ).toEqual({ variant: 'control', source: 'user-hash' })
  })

  it('puts anonymous devices in control and keeps the device unit', () => {
    expect(
      getDiscoveryExperimentAssignment({ deviceId: 'anonymous-device' })
    ).toEqual({ variant: 'control', source: 'device-hash' })
  })

  it('waits when neither identity is available', () => {
    expect(getDiscoveryExperimentAssignment({})).toBeUndefined()
  })

  it('offers the web hook only the control variant', () => {
    expect(DISCOVERY_EXPERIMENT_ACTIVE_VARIANTS).toEqual(['control'])
  })
})

describe('effective discovery experiment variant', () => {
  it('leaves old clients in control when they omit the experiment field', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({ userId: 'ordinary-user' })
    ).toBe('control')
  })

  it('ignores a treatment request from a signed-in client', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({
        userId: 'ordinary-user',
        requestedVariant: 'treatment',
      })
    ).toBe('control')
  })

  it('ignores a treatment request from the former forced QA account', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({
        userId: 'cA1JupYR5AR8btHUs2xvkui7jA93',
        requestedVariant: 'treatment',
      })
    ).toBe('control')
  })

  it('ignores a treatment request from an anonymous client', () => {
    expect(
      getEffectiveDiscoveryExperimentVariant({
        requestedVariant: 'treatment',
      })
    ).toBe('control')
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
