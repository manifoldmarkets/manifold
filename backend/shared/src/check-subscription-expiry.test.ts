import { daysUntilExpiry } from 'scheduler/jobs/check-subscription-expiry'

// Included in the shared CI suite. To run just this regression:
//   yarn --cwd backend/shared test --testPathPattern check-subscription-expiry
describe('daysUntilExpiry', () => {
  const now = Date.parse('2026-10-09T12:00:00Z')

  it('accepts the text pg hands back for a timestamptz column', () => {
    // This is the shape that threw "expires_time.getTime is not a function".
    expect(daysUntilExpiry('2026-10-12 12:00:00+00', now)).toBe(3)
  })

  it('accepts PostgreSQL timestamps with microsecond precision', () => {
    expect(daysUntilExpiry('2026-10-12 00:00:00.123456+00', now)).toBe(3)
  })

  it('still accepts a Date', () => {
    expect(daysUntilExpiry(new Date('2026-10-11T12:00:00Z'), now)).toBe(2)
  })

  it('rounds a partial day up, so 2 days and a second is 3', () => {
    expect(daysUntilExpiry('2026-10-11T12:00:01Z', now)).toBe(3)
  })
})
