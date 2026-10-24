import {
  CompetitionSwitchState,
  countByReadiness,
  DEFAULT_SWITCH_FILTER,
  filterSwitches,
  SPORTS_CALENDAR,
  switchReadiness,
} from './sports-calendar'

const phase = (
  overrides: Partial<CompetitionSwitchState> & { competition: string }
): CompetitionSwitchState => ({
  competitionId: overrides.competition.toLowerCase().replace(/\s+/g, '-'),
  phase: 'Season',
  sport: 'soccer',
  startDate: '2026-08-01',
  endDate: '2027-05-30',
  status: 'active',
  on: false,
  defaultOn: false,
  overlaps: [],
  ...overrides,
})

const nflOn = phase({ competition: 'NFL', sport: 'nfl', on: true })
const laLiga = phase({ competition: 'La Liga', notes: '380 games' })
const fiveSided = phase({
  competition: 'Copa del Rey',
  locked: 'Confirm regular-season windows or implement regulation-time scores',
})
const lastSeason = phase({
  competition: 'WNBA 2026',
  sport: 'wnba',
  phase: 'Playoffs',
  status: 'completed',
})
const all = [nflOn, laLiga, fiveSided, lastSeason]

describe('switchReadiness', () => {
  it('reads a lock as needing validation even when a switch is on', () => {
    expect(switchReadiness(nflOn)).toBe('on')
    expect(switchReadiness(laLiga)).toBe('ready')
    expect(switchReadiness(fiveSided)).toBe('needs-validation')
    expect(switchReadiness({ ...fiveSided, on: true })).toBe('needs-validation')
  })
})

describe('filterSwitches', () => {
  it('hides locked and finished phases by default', () => {
    expect(filterSwitches(all, DEFAULT_SWITCH_FILTER)).toEqual([nflOn, laLiga])
  })

  it('shows only what each readiness choice names', () => {
    const f = (readiness: typeof DEFAULT_SWITCH_FILTER.readiness) =>
      filterSwitches(all, { ...DEFAULT_SWITCH_FILTER, readiness })
    expect(f('on')).toEqual([nflOn])
    expect(f('needs-validation')).toEqual([fiveSided])
    expect(f('all')).toEqual([nflOn, laLiga, fiveSided])
  })

  it('includes finished phases only when asked', () => {
    expect(
      filterSwitches(all, { ...DEFAULT_SWITCH_FILTER, showFinished: true })
    ).toEqual([nflOn, laLiga, lastSeason])
  })

  it('narrows by sport', () => {
    expect(
      filterSwitches(all, {
        ...DEFAULT_SWITCH_FILTER,
        readiness: 'all',
        sport: 'soccer',
      })
    ).toEqual([laLiga, fiveSided])
  })

  it('searches the competition, phase, notes, lock reason and sport label', () => {
    const search = (query: string) =>
      filterSwitches(all, {
        ...DEFAULT_SWITCH_FILTER,
        readiness: 'all',
        showFinished: true,
        query,
      }).map((s) => s.competition)
    expect(search('  liga ')).toEqual(['La Liga'])
    expect(search('380')).toEqual(['La Liga'])
    expect(search('playoffs')).toEqual(['WNBA 2026'])
    expect(search('regulation-time')).toEqual(['Copa del Rey'])
    expect(search('soccer')).toEqual(['La Liga', 'Copa del Rey'])
    expect(search('cricket')).toEqual([])
  })
})

describe('countByReadiness', () => {
  it('counts what each choice would show under the other filters', () => {
    expect(countByReadiness(all, DEFAULT_SWITCH_FILTER)).toEqual({
      all: 3,
      on: 1,
      ready: 2,
      'needs-validation': 1,
    })
    expect(
      countByReadiness(all, { ...DEFAULT_SWITCH_FILTER, sport: 'nfl' })
    ).toEqual({ all: 1, on: 1, ready: 1, 'needs-validation': 0 })
  })
})

it('has locked phases to filter in the real calendar', () => {
  // The default filter is only worth having while the calendar carries
  // feeds that need validation before they can run.
  expect(
    SPORTS_CALENDAR.filter((e) => e.oddsKey && e.locked).length
  ).toBeGreaterThan(0)
})
