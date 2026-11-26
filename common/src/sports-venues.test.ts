import {
  formatLocalStart,
  gameStartLabel,
  NEUTRAL_SITE_GAMES,
  TEAM_TIME_ZONES,
  venueTimeZone,
} from './sports-venues'
import { NFL_TEAM_TLA } from './sports'
import { TEAM_CODES } from './sports-team-codes'

const BEFORE = Date.parse('2026-11-01T00:00:00Z')

describe('venueTimeZone', () => {
  it('uses the home team city', () => {
    const start = Date.parse('2026-11-03T03:00:00Z')
    expect(
      venueTimeZone('nba', 'Los Angeles Clippers', 'Toronto Raptors', start)
    ).toBe('America/Los_Angeles')
    expect(
      venueTimeZone('nfl', 'Seattle Seahawks', 'Chicago Bears', start)
    ).toBe('America/Los_Angeles')
  })

  it('uses the venue for a listed neutral-site game, either way round', () => {
    // Bengals at Falcons in Madrid, 9:30am ET.
    const start = Date.parse('2026-11-08T14:30:00Z')
    expect(
      venueTimeZone('nfl', 'Atlanta Falcons', 'Cincinnati Bengals', start)
    ).toBe('Europe/Madrid')
    expect(
      venueTimeZone('nfl', 'Cincinnati Bengals', 'Atlanta Falcons', start)
    ).toBe('Europe/Madrid')
  })

  it('does not apply a neutral site to other games that day', () => {
    const start = Date.parse('2026-11-08T18:00:00Z')
    expect(
      venueTimeZone('nfl', 'Chicago Bears', 'Green Bay Packers', start)
    ).toBe('America/Chicago')
  })

  it('matches a teamless entry by the venue date', () => {
    // Super Bowl LXI, 3:30pm PT on 14 Feb 2027.
    const start = Date.parse('2027-02-14T23:30:00Z')
    expect(
      venueTimeZone('nfl', 'Kansas City Chiefs', 'Detroit Lions', start)
    ).toBe('America/Los_Angeles')
  })

  it('returns undefined for an unknown team', () => {
    expect(
      venueTimeZone('nba', 'Unknown Team', 'Miami Heat', BEFORE)
    ).toBeUndefined()
  })
})

describe('formatLocalStart', () => {
  it('formats in the venue time zone with its abbreviation', () => {
    expect(
      formatLocalStart(Date.parse('2026-11-08T14:30:00Z'), 'Europe/Madrid')
    ).toBe('Sun, Nov 8, 3:30pm CET')
    expect(
      formatLocalStart(
        Date.parse('2026-11-03T03:00:00Z'),
        'America/Los_Angeles'
      )
    ).toBe('Mon, Nov 2, 7:00pm PST')
    expect(
      formatLocalStart(Date.parse('2026-11-09T01:20:00Z'), 'America/New_York')
    ).toBe('Sun, Nov 8, 8:20pm EST')
  })
})

describe('gameStartLabel', () => {
  const game = {
    sportsLeague: 'NBA',
    sportsHomeTeam: 'Los Angeles Clippers',
    sportsAwayTeam: 'Toronto Raptors',
    sportsStartTimestamp: '2026-11-03T03:00:00Z',
  }

  it('labels an NBA game before tip-off', () => {
    expect(gameStartLabel(game, BEFORE)).toBe('Tip-off Mon, Nov 2, 7:00pm PST')
  })

  it('labels an NFL game as kickoff', () => {
    expect(
      gameStartLabel(
        {
          sportsLeague: 'NFL',
          sportsHomeTeam: 'Atlanta Falcons',
          sportsAwayTeam: 'Cincinnati Bengals',
          sportsStartTimestamp: '2026-11-08T14:30:00Z',
        },
        BEFORE
      )
    ).toBe('Kickoff Sun, Nov 8, 3:30pm CET')
  })

  it('shows nothing once the game has started', () => {
    expect(
      gameStartLabel(game, Date.parse('2026-11-03T03:00:00Z'))
    ).toBeUndefined()
  })

  it('shows nothing for other sports or markets without teams', () => {
    expect(
      gameStartLabel({ ...game, sportsLeague: 'Soccer' }, BEFORE)
    ).toBeUndefined()
    expect(
      gameStartLabel({ ...game, sportsHomeTeam: undefined }, BEFORE)
    ).toBeUndefined()
  })
})

describe('data', () => {
  it('has a time zone for every NFL and NBA team with a code', () => {
    expect(Object.keys(TEAM_TIME_ZONES.nfl ?? {}).sort()).toEqual(
      Object.keys(NFL_TEAM_TLA).sort()
    )
    expect(Object.keys(TEAM_TIME_ZONES.nba ?? {}).sort()).toEqual(
      Object.keys(TEAM_CODES.nba ?? {}).sort()
    )
  })

  it('lists neutral-site teams by their known names and valid zones', () => {
    for (const g of NEUTRAL_SITE_GAMES) {
      expect(() =>
        new Intl.DateTimeFormat('en-US', { timeZone: g.timeZone }).format()
      ).not.toThrow()
      for (const t of g.teams ?? [])
        expect(Object.keys(TEAM_TIME_ZONES[g.sport] ?? {})).toContain(t)
    }
  })
})
