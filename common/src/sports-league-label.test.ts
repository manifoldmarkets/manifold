import { isSportsBdlEnabled } from './bdl/rollout'
jest.mock('./bdl/rollout', () => ({ isSportsBdlEnabled: jest.fn(() => true) }))
import type { Contract } from './contract'
import { SPORTS_CALENDAR } from './sports-calendar'
import { SPORT_CATEGORIES } from './sports-schedule'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'
import {
  getSportsLeagueLabel,
  hasPublicTeamScoreboard,
  sportsLeagueHref,
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

  it.each(['nba', 'wnba', 'mlb', 'nhl', 'nfl'] as const)(
    'links %s games by event identity',
    (league) => {
      const game = {
        creatorId: sports,
        sportsEventId: 'bdl:' + league + ':22',
        sportsLeagueKey: league,
        sportsLeague: 'Other',
      }
      expect(getSportsLeagueLabel(game)).toBe(league.toUpperCase())
      expect(sportsLeagueHref(game)).toBe('/sports/' + league)
      expect(
        getSportsLeagueLabel({ ...game, sportsProvider: 'odds' })
      ).toBeUndefined()
      expect(
        getSportsLeagueLabel({ ...game, sportsFixture: true })
      ).toBeUndefined()
      expect(
        getSportsLeagueLabel({ ...game, creatorId: 'visitor' })
      ).toBeUndefined()
    }
  )

  it('rejects conflicting league identities and keeps legacy dashboard links', () => {
    expect(
      getSportsLeagueLabel({
        creatorId: sports,
        sportsEventId: 'bdl:nhl:22',
        sportsLeagueKey: 'nba',
      })
    ).toBeUndefined()
    for (const sportsEventId of ['fd-537327', 'legacy-1'])
      expect(
        sportsLeagueHref({
          creatorId: sports,
          sportsLeague: 'FIFA World Cup',
          sportsEventId,
        })
      ).toBe('/sports/world-cup-2026')
  })

  it('only mounts the live panel for an official public major-league winner market', () => {
    const game = {
      creatorId: sports,
      sportsEventId: 'bdl:nba:1',
      sportsMarketType: 'moneyline',
      mechanism: 'cpmm-multi-2',
      outcomeType: 'MULTIPLE_CHOICE',
      visibility: 'public',
      token: 'MANA',
    } as unknown as Contract
    jest.mocked(isSportsBdlEnabled).mockReturnValueOnce(false)
    expect(hasPublicTeamScoreboard(game)).toBe(false)
    expect(hasPublicTeamScoreboard(game)).toBe(true)
    for (const changes of [
      { visibility: 'private' },
      { visibility: 'unlisted' },
      { token: 'CASH' },
      { deleted: true },
      { creatorId: 'other' },
      { sportsFixture: true },
      { sportsMarketType: 'prop' },
      { sportsEventId: 'bdl:fifa/worldcup:1' },
      { sportsEventId: 'bdl-f1:374:1869' },
      { sportsEventId: 'odds:basketball_nba:1' },
      { mechanism: 'cpmm-1' },
      { outcomeType: 'NUMBER' },
    ])
      expect(hasPublicTeamScoreboard({ ...game, ...changes } as Contract)).toBe(
        false
      )
  })

  it('has a label for every sport key on the calendar', () => {
    const keys = SPORTS_CALENDAR.flatMap((e) => (e.oddsKey ? [e.oddsKey] : []))
    expect(keys.filter((k) => !LEAGUE_LABEL_ODDS_KEYS.includes(k))).toEqual([])
  })
})

it('uses the original Odds, World Cup and F1 badges and destinations with rollout off', () => {
  jest.mocked(isSportsBdlEnabled).mockReturnValue(false)
  try {
    const owner = { creatorId: MANIFOLD_SPORTS_USER_IDS[0] }
    for (const [sportsEventId, sportsLeague, label, href] of [
      ['odds:americanfootball_nfl:abc', 'NFL', 'NFL', '/sports/nfl'],
      ['fd-537327', 'FIFA World Cup', 'WC26', '/sports/world-cup-2026'],
      ['bdl-f1:17:22', 'Formula 1', 'F1', '/sports/f1'],
    ]) {
      const contract = { ...owner, sportsEventId, sportsLeague }
      expect(getSportsLeagueLabel(contract)).toBe(label)
      expect(sportsLeagueHref(contract)).toBe(href)
    }
    expect(
      getSportsLeagueLabel({ ...owner, sportsEventId: 'bdl:nba:22' })
    ).toBeUndefined()
  } finally {
    jest.mocked(isSportsBdlEnabled).mockReturnValue(true)
  }
})
