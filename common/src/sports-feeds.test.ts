import { ADDITIONAL_SPORTS_FEEDS, additionalFeedCalendar } from './sports-feeds'
import {
  autoCreates,
  calendarPhaseKey,
  phaseWindow,
  SPORTS_CALENDAR,
  SPORT_ID_TO_SPORT_KEY,
} from './sports-calendar'
import { sportForMarket, SPORT_BY_KEY } from './sports-schedule'
import { getSportsLeagueLabel } from './sports-league-label'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'
import { buildOddsMarketParams } from './odds-markets'

it('routes every additional feed through creation, classification and league labels', () => {
  const keys = ADDITIONAL_SPORTS_FEEDS.map((f) => f.key)
  expect(new Set(keys).size).toBe(keys.length)
  expect(new Set(SPORTS_CALENDAR.map(calendarPhaseKey)).size).toBe(
    SPORTS_CALENDAR.length
  )
  for (const entry of additionalFeedCalendar()) {
    const market = buildOddsMarketParams(
      {
        id: 'event',
        sport_key: entry.oddsKey!,
        sport_title: entry.competition,
        commence_time: '2026-11-01T12:00:00Z',
        home_team: 'Home',
        away_team: 'Away',
        bookmakers: [],
      },
      entry
    )
    const sport = SPORT_ID_TO_SPORT_KEY[entry.sport]
    expect(SPORT_BY_KEY[sport]).toBeDefined()
    expect(sportForMarket({ sportsLeague: market.sportsLeague })).toBe(sport)
    expect(sportForMarket({ sportsLeague: entry.oddsKey })).toBe(sport)
    expect(
      getSportsLeagueLabel({
        ...market,
        creatorId: MANIFOLD_SPORTS_USER_IDS[0],
      })
    ).toBe(entry.competition)
    expect(autoCreates(entry, { [calendarPhaseKey(entry)]: true })).toBe(
      !entry.locked
    )
  }
})

it('never makes odds-only feeds or unvalidated settlement rules automatically available', () => {
  expect(
    ADDITIONAL_SPORTS_FEEDS.some((f) => f.key === 'mma_mixed_martial_arts')
  ).toBe(false)
  expect(ADDITIONAL_SPORTS_FEEDS.some((f) => f.key === 'cricket_ipl')).toBe(
    false
  )
  for (const entry of additionalFeedCalendar()) {
    expect(entry.autoCreate).toBe(false)
    if (entry.sport === 'tennis' || entry.oddsKey === 'soccer_fa_cup')
      expect(autoCreates(entry, { [calendarPhaseKey(entry)]: true })).toBe(
        false
      )
  }
})

it('excludes February knockouts from the new UEFA league-phase feeds', () => {
  const entries = additionalFeedCalendar().filter(
    (e) => e.phase === 'League Phase'
  )
  expect(entries.map((e) => e.endDate).sort()).toEqual([
    '2026-12-17',
    '2027-01-28',
  ])
  for (const entry of entries) {
    const window = phaseWindow(entry)
    expect(window.to).toBeLessThan(Date.parse('2027-02-01T00:00:00Z'))
    expect(window.to).toBeGreaterThan(Date.parse(`${entry.endDate}T20:00:00Z`))
  }
})
