import {
  BROWSE_EXPERIMENT,
  BrowseEnrollment,
  enrollBrowseVisitor,
  getBrowseView,
  isExistingBrowseUser,
  readBrowseEnrollment,
  readBrowseView,
  readDeviceHistory,
} from './browse-rollout'

const history = { deviceId: 'fresh-browser', firstSeenTime: 1000 }
const enroll = (
  overrides: Partial<Parameters<typeof enrollBrowseVisitor>[0]> = {}
) => enrollBrowseVisitor({ history, now: 2000, ...overrides })

describe('browse beta and new-visitor rollout', () => {
  it('keeps returning anonymous browsers and existing accounts on Classic', () => {
    for (const enrollment of [
      enroll({ history: { ...history, firstSeenTime: null } }),
      enroll({ user: { initialDeviceToken: 'old-browser' } }),
      enroll({ user: { initialDeviceToken: history.deviceId, isBot: true } }),
      enroll({ user: {} }),
    ]) {
      expect(enrollment.variant).toBeNull()
      expect(getBrowseView({ enrollment, existingUser: false })).toBe('legacy')
    }
  })

  it('assigns fresh visitors consistently and approximately 50/50', () => {
    let treatment = 0
    for (let i = 0; i < 10000; i++) {
      const browser = { ...history, deviceId: `browser-${i}` }
      const first = enroll({ history: browser })
      expect(enroll({ history: browser, now: 9000 }).variant).toBe(
        first.variant
      )
      expect(first.cohort).toBe('new-visitor')
      if (first.variant === 'treatment') treatment++
    }
    expect(treatment).toBeGreaterThan(4800)
    expect(treatment).toBeLessThan(5200)
  })

  it('preserves the default through signup without rerandomizing on user id', () => {
    const before = enroll()
    const user = { initialDeviceToken: history.deviceId }
    const after = enroll({ user })
    expect(isExistingBrowseUser(history, user)).toBe(false)
    expect(after.variant).toBe(before.variant)
    expect(after.cohort).toBe('new-visitor')
  })

  it('retains randomized enrollment when somebody chooses another layout', () => {
    const enrollment: BrowseEnrollment = { ...enroll(), variant: 'treatment' }
    expect(getBrowseView({ enrollment, existingUser: false })).toBe('new')
    expect(
      getBrowseView({ enrollment, existingUser: false, preference: 'legacy' })
    ).toBe('legacy')
    const restored = readBrowseEnrollment(
      JSON.parse(JSON.stringify(enrollment)),
      history.deviceId
    )
    expect(restored).toEqual(enrollment)
    expect(restored?.variant).toBe('treatment')
  })

  it('lets existing users opt in and honors beta choices made before enrollment', () => {
    for (const priorChoice of ['new', 'legacy'] as const) {
      const enrollment = enroll({
        priorChoice,
        user: { initialDeviceToken: 'old-browser' },
      })
      expect(enrollment.cohort).toBe('prior-choice')
      expect(enrollment.variant).toBeNull()
      expect(
        getBrowseView({
          enrollment,
          preference: priorChoice,
          existingUser: true,
        })
      ).toBe(priorChoice)
    }
  })

  it('protects returning accounts discovered after anonymous assignment', () => {
    const enrollment: BrowseEnrollment = { ...enroll(), variant: 'treatment' }
    expect(
      isExistingBrowseUser(history, { initialDeviceToken: 'old-browser' })
    ).toBe(true)
    expect(getBrowseView({ enrollment, existingUser: true })).toBe('legacy')
    expect(
      getBrowseView({ enrollment, existingUser: true, preference: 'new' })
    ).toBe('new')
    expect(enrollment.variant).toBe('treatment')
  })

  it('fails safely to Classic when storage is unavailable', () => {
    const enrollment = enroll({ history: undefined })
    expect(enrollment.cohort).toBe('unavailable')
    expect(enrollment.variant).toBeNull()
    expect(getBrowseView({ enrollment, existingUser: false })).toBe('legacy')
    expect(
      getBrowseView({ enrollment, existingUser: false, preference: 'new' })
    ).toBe('new')
  })

  it('rejects stale, malformed, and other-device enrollments', () => {
    const valid = enroll()
    for (const value of [
      null,
      'new',
      {},
      { ...valid, deviceId: 'other' },
      { ...valid, experiment: 'old' },
      { ...valid, enrolledAt: NaN },
      { ...valid, signedInAtEnrollment: undefined },
      { ...valid, cohort: 'existing-user' },
      { ...valid, variant: null },
    ])
      expect(readBrowseEnrollment(value, history.deviceId)).toBeUndefined()
    expect(valid.experiment).toBe(BROWSE_EXPERIMENT)
  })

  it('does not turn missing historical dates into new visitors', () => {
    expect(
      readDeviceHistory({ ...history, firstSeenTime: null }, history.deviceId)
        ?.firstSeenTime
    ).toBeNull()
    expect(readDeviceHistory({}, history.deviceId)).toBeUndefined()
    expect(
      readDeviceHistory({ ...history, firstSeenTime: '1000' }, history.deviceId)
    ).toBeUndefined()
    expect(readDeviceHistory(history, 'other')).toBeUndefined()
    expect(readBrowseView('cards')).toBeUndefined()
  })
})
