import { normalizeBdlStatus, providerOf } from './sports-provider'

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

it.each([
  ['odds:nba:40', 'odds'],
  ['bdl-f1:27:4', 'bdl'],
  ['bdl-f1-title:2026:drivers', 'bdl'],
  ['bdl:nba:40', 'bdl'],
  ['fd-123', 'football-data'],
  ['fixture:nba:40', 'fixture'],
  ['bdl-f1-other:10', 'legacy'],
  ['fd:123', 'legacy'],
  ['xodds:nba:40', 'legacy'],
  ['ODDS:nba:40', 'legacy'],
  ['', 'legacy'],
  [null, 'legacy'],
])(
  'identifies the provider of a legacy event ID %s',
  (sportsEventId, expected) => {
    expect(providerOf({ sportsEventId })).toBe(expected)
  }
)

it('uses a stored provider even when the event ID belongs to another provider', () => {
  expect(
    providerOf({
      sportsProvider: 'fixture',
      sportsEventId: 'odds:basketball_nba:12',
    })
  ).toBe('fixture')
  expect(providerOf({ sportsProvider: 'bdl' })).toBe('bdl')
  expect(providerOf({ sportsProvider: null, sportsEventId: 'fd-24' })).toBe(
    'football-data'
  )
  expect(providerOf({})).toBe('legacy')
})
