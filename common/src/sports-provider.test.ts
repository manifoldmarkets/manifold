import { normalizeBdlStatus } from './sports-provider'

it.each([
  'scheduled',
  'in_progress',
  'final',
  'postponed',
  'canceled',
  'delayed',
  'suspended',
  'abandoned',
  'unknown',
])('retains status_state %s', (value) => {
  expect(normalizeBdlStatus(value)).toBe(value)
})

it('uses field-specific aliases for European basketball', () => {
  expect(normalizeBdlStatus('live', 'european-basketball-status')).toBe(
    'in_progress'
  )
  expect(normalizeBdlStatus('cancelled', 'european-basketball-status')).toBe(
    'canceled'
  )
  expect(normalizeBdlStatus('canceled', 'european-basketball-status')).toBe(
    'unknown'
  )
  expect(normalizeBdlStatus('cancelled')).toBe('unknown')
})

it.each([
  undefined,
  null,
  1,
  {},
  false,
  'finished',
  'FINAL',
  'in progress',
  'canceled ',
])('routes unrecognised lifecycle values to unknown', (value) => {
  expect(normalizeBdlStatus(value)).toBe('unknown')
})
