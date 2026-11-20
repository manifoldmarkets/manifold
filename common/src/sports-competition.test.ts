import type { Sports } from './contract'
import { oddsEventId } from './odds-markets'
import { sportsCompetitionIdOf } from './sports-competition'

const oddsMarket = (sportKey: string, kickoff: string): Partial<Sports> => ({
  sportsEventId: oddsEventId(sportKey, 'event-id'),
  sportsStartTimestamp: kickoff,
})
const nba = oddsMarket('basketball_nba', '2026-11-05T20:00:00-05:00')

describe('sportsCompetitionIdOf', () => {
  it('returns the explicitly stored ID first even for a provider or date without an Odds API phase', () => {
    expect(
      sportsCompetitionIdOf({ ...nba, sportsCompetitionId: 'dedicated-phase' })
    ).toBe('dedicated-phase')
    expect(
      sportsCompetitionIdOf({
        sportsCompetitionId: 'bdl-season',
        sportsProvider: 'bdl',
      })
    ).toBe('bdl-season')
  })
  it('matches a historical feed by its key and kickoff, even when its current creation switch is off', () => {
    expect(sportsCompetitionIdOf(nba)).toBe('nba-regular-2026-27')
    expect(sportsCompetitionIdOf({ ...nba, sportsCompetitionId: ' ' })).toBe(
      'nba-regular-2026-27'
    )
    expect(
      sportsCompetitionIdOf({
        ...nba,
        sportsStartTimestamp: '2027-04-25T22:00:00Z',
      })
    ).toBe('nba-playoffs-2027')
  })
  it('uses the calendar’s inclusive US evening grace period', () => {
    const superBowl = oddsMarket('americanfootball_nfl', '2027-02-15T23:59:59Z')
    expect(sportsCompetitionIdOf(superBowl)).toBe('nfl-playoffs-2027')
    expect(
      sportsCompetitionIdOf({
        ...superBowl,
        sportsStartTimestamp: '2027-02-16T00:00:00Z',
      })
    ).toBeUndefined()
  })
  it('accepts coincident phases of one competition and declines overlapping distinct competitions', () => {
    expect(
      sportsCompetitionIdOf(oddsMarket('baseball_mlb', '2026-10-25T12:00:00Z'))
    ).toBe('mlb-2026')
    expect(
      sportsCompetitionIdOf(
        oddsMarket('americanfootball_ncaaf', '2026-12-24T12:00:00Z')
      )
    ).toBeUndefined()
  })
  it('declines an unrecognized feed, a calendar gap, or a missing, date-only, or invalid kickoff', () => {
    expect(
      sportsCompetitionIdOf(oddsMarket('unknown', '2026-11-05T02:00:00Z'))
    ).toBeUndefined()
    for (const kickoff of [
      undefined,
      '',
      '2026-11-05',
      '2026-11-31T02:00:00Z',
      '2027-04-15T00:00:00Z',
    ]) {
      expect(
        sportsCompetitionIdOf({ ...nba, sportsStartTimestamp: kickoff })
      ).toBeUndefined()
    }
  })
  it('infers only for an Odds API game with a known kickoff and valid event ID', () => {
    for (const fields of [
      { sportsEventId: 'odds:basketball_nba' },
      { sportsEventId: 'bdl:nba:10' },
      { sportsProvider: 'bdl' },
      { sportsFixture: true },
      { sportsStartKnown: false },
    ] satisfies Partial<Sports>[]) {
      expect(sportsCompetitionIdOf({ ...nba, ...fields })).toBeUndefined()
    }
  })
})
