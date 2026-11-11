import { SPORTS_CALENDAR } from './sports-calendar'
import { SPORT_CATEGORIES } from './sports-schedule'
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

  it('names college games the way the /sports chips do', () => {
    const chip = (key: string) =>
      SPORT_CATEGORIES.find((c) => c.key === key)?.label
    const label = (sportKey: string) =>
      getSportsLeagueLabel({
        creatorId: sports,
        sportsEventId: `odds:${sportKey}:abc`,
      })
    expect(label('americanfootball_ncaaf')).toBe(chip('ncaaf'))
    expect(label('basketball_ncaab')).toBe(chip('ncaab'))
  })

  it('labels the older football-data World Cup markets WC26', () => {
    expect(
      getSportsLeagueLabel({
        creatorId: sports,
        sportsEventId: '537327',
        sportsLeague: 'FIFA World Cup',
      })
    ).toBe('WC26')
  })

  it('labels the F1 session and title markets F1', () => {
    const label = (sportsEventId: string) =>
      getSportsLeagueLabel({
        creatorId: sports,
        sportsEventId,
        sportsLeague: 'Formula 1',
      })
    expect(label('bdl-f1:374:1869')).toBe('F1')
    expect(label('bdl-f1-title:2027:drivers')).toBe('F1')
    expect(label('bdl-f1-title:2027:constructors')).toBe('F1')
    // An id that isn't the pipeline's shape gets no label.
    expect(label('bdl-f1:374')).toBeUndefined()
    expect(label('bdl-f1-title:2027:fastest-lap')).toBeUndefined()
    expect(
      getSportsLeagueLabel({
        creatorId: 'someone',
        sportsEventId: 'bdl-f1:374:1869',
        sportsLeague: 'Formula 1',
      })
    ).toBeUndefined()
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
