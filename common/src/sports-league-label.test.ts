import { SPORTS_CALENDAR } from './sports-calendar'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'
import {
  getSportsLeagueLabel,
  LEAGUE_LABEL_ODDS_KEYS,
} from './sports-league-label'

const sports = MANIFOLD_SPORTS_USER_IDS[0]

describe('getSportsLeagueLabel', () => {
  it('labels an @ManifoldSports game market by its sport key', () => {
    expect(
      getSportsLeagueLabel({
        creatorId: sports,
        sportsEventId: 'odds:americanfootball_nfl:abc',
        sportsLeague: 'NFL',
      })
    ).toBe('NFL')
    // Every soccer league has sportsLeague 'Soccer'; the key tells them apart.
    expect(
      getSportsLeagueLabel({
        creatorId: MANIFOLD_SPORTS_USER_IDS[1],
        sportsEventId: 'odds:soccer_epl:abc',
        sportsLeague: 'Soccer',
      })
    ).toBe('EPL')
  })

  it('labels the older football-data markets by league', () => {
    expect(
      getSportsLeagueLabel({
        creatorId: sports,
        sportsEventId: '537327',
        sportsLeague: 'FIFA World Cup',
      })
    ).toBe('WORLD CUP')
  })

  it("doesn't label a market someone else made with sports fields", () => {
    expect(
      getSportsLeagueLabel({
        creatorId: 'someone',
        sportsEventId: 'odds:americanfootball_nfl:abc',
        sportsLeague: 'NFL',
      })
    ).toBeUndefined()
  })

  it("doesn't label a non-game market or an unknown sport key", () => {
    expect(getSportsLeagueLabel({ creatorId: sports })).toBeUndefined()
    expect(
      getSportsLeagueLabel({
        creatorId: sports,
        sportsEventId: 'odds:cricket_ipl:abc',
      })
    ).toBeUndefined()
  })

  it('has a label for every sport key on the calendar', () => {
    const keys = SPORTS_CALENDAR.flatMap((e) => (e.oddsKey ? [e.oddsKey] : []))
    expect(keys.filter((k) => !LEAGUE_LABEL_ODDS_KEYS.includes(k))).toEqual([])
  })
})
