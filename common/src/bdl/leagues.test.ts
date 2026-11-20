import {
  BDL_ADDITIONAL_SPORTS,
  CLOSE_BUFFER_HOURS,
  SPORT_ID_TO_SPORT_KEY,
  SPORT_LEAGUE_LABEL,
  SPORTS_CALENDAR,
} from '../sports-calendar'
import {
  FINALS_FROM_MINUTES,
  pollingSettingError,
  sportForLeague,
} from '../sports-score-polling'
import { BDL_DEFAULT_MAX_LEAD_DAYS, BDL_PER_LEAGUE_RUN_CAP } from './constants'
import { BDL_LEAGUE_KEYS, BDL_LEAGUES, isBdlLeagueKey } from './leagues'

const documentedLeagues = {
  'us-majors': ['nba', 'nfl', 'nhl', 'wnba', 'mlb'],
  college: ['ncaaf', 'ncaab', 'ncaaw', 'cbb'],
  soccer: [
    'epl',
    'laliga',
    'seriea',
    'bundesliga',
    'ligue1',
    'ucl',
    'mls',
    'fifa/worldcup',
  ],
  'european-basketball': [
    'euroleague',
    'eurocup',
    'bcl',
    'acb',
    'bsl',
    'gbl',
    'lba',
    'bbl',
    'lnb',
    'aba',
    'lkl',
    'vtb',
    'bnxt',
    'israel',
  ],
  cba: ['cba'],
  tennis: ['atp', 'wta'],
  golf: ['pga', 'lpga'],
  mma: ['mma'],
  f1: ['f1'],
  esports: ['cs', 'valorant', 'lol', 'dota'],
}

it('registers every documented league once with its adapter and a default-off switch', () => {
  expect(BDL_LEAGUE_KEYS).toHaveLength(42)
  expect(new Set(BDL_LEAGUE_KEYS)).toEqual(
    new Set(Object.values(documentedLeagues).flat())
  )
  for (const [adapter, leagueKeys] of Object.entries(documentedLeagues)) {
    expect(
      BDL_LEAGUE_KEYS.filter(
        (key) => BDL_LEAGUES[key].adapter === adapter
      ).sort()
    ).toEqual([...leagueKeys].sort())
  }
  for (const key of BDL_LEAGUE_KEYS) {
    const league = BDL_LEAGUES[key]
    expect(league.defaultAutoCreate).toBe(false)
    expect(league.perRunCap).toBe(BDL_PER_LEAGUE_RUN_CAP)
    expect(league.maxLeadDays).toBe(BDL_DEFAULT_MAX_LEAD_DAYS)
    expect(league.closeAtStart).toBe(false)
    expect(league.verification).toBe('bdl-only')
    expect(league.sportKey).toBe(SPORT_ID_TO_SPORT_KEY[league.sportId])
    expect(SPORT_LEAGUE_LABEL[league.sportId]).toBeTruthy()
    if (league.titleDateTz !== 'venue') {
      expect(
        () => new Intl.DateTimeFormat('en', { timeZone: league.titleDateTz })
      ).not.toThrow()
    }
    expect(league.apiBase.startsWith('/' + key + '/v')).toBe(true)
    expect(league.oddsApiBase === null).toBe(league.oddsQuery === null)
  }
})

it('keeps provider-specific paths, seasons and league identifiers distinct', () => {
  expect(BDL_LEAGUES.nba).toMatchObject({
    apiBase: '/nba/v1',
    oddsApiBase: '/nba/v2',
  })
  expect(BDL_LEAGUES.pga).toMatchObject({
    apiBase: '/pga/v2',
    oddsApiBase: '/pga/v1',
  })
  expect(BDL_LEAGUES.epl.apiBase).toBe('/epl/v2')
  expect(BDL_LEAGUES['fifa/worldcup']).toMatchObject({
    apiBase: '/fifa/worldcup/v1',
    specSlug: 'fifa',
  })
  expect(BDL_LEAGUES.cbb).toMatchObject({
    label: 'College Baseball',
    sportId: 'cbase',
    sportKey: 'other',
    seasonConvention: 'spring-year',
  })
  expect(BDL_LEAGUES.ncaab).toMatchObject({
    sportId: 'cbb',
    seasonConvention: 'start-year-minus-one',
  })
  expect(BDL_LEAGUES.cba.dateFilterTz).toBe('Asia/Shanghai')
  expect(BDL_LEAGUES.nfl.oddsQuery).toBe('season+week')
  expect(BDL_LEAGUES.f1.webhooks).toBe(false)
  expect(
    BDL_LEAGUE_KEYS.filter((key) => BDL_LEAGUES[key].webhooks)
  ).toHaveLength(19)
})

it.each([
  'constructor',
  '__proto__',
  'toString',
  'fifa',
  'worldcup',
  'cs2',
  '',
])('rejects non-league keys including %j', (value) => {
  expect(isBdlLeagueKey(value)).toBe(false)
})

it('keeps new calendar sport IDs separate from existing Odds API polling and phases', () => {
  for (const [id, sport] of Object.entries(BDL_ADDITIONAL_SPORTS)) {
    expect(sportForLeague(sport.label)).toBeUndefined()
    expect(pollingSettingError('sport:' + id, 60)).toBeDefined()
    expect(SPORTS_CALENDAR.some((entry) => entry.sport === id)).toBe(false)
  }
  expect(SPORTS_CALENDAR.some((entry) => entry.provider === 'bdl')).toBe(false)
  expect(SPORT_LEAGUE_LABEL.cbb).toBe('NCAAB')
  expect(SPORT_LEAGUE_LABEL.cbase).toBe('College Baseball')
  expect(SPORT_LEAGUE_LABEL.nba).toBe('NBA')
  expect(SPORT_LEAGUE_LABEL.basketball).toBe('Basketball')
  expect(sportForLeague('Soccer')).toBe('soccer')
  expect(pollingSettingError('sport:nba', 60)).toBeUndefined()
})

it('separates source slugs, calendar sport IDs and navigation categories', () => {
  expect(
    [
      BDL_LEAGUES.cs,
      BDL_LEAGUES.valorant,
      BDL_LEAGUES.lol,
      BDL_LEAGUES.dota,
    ].map((league) => [league.sportId, league.sportKey])
  ).toEqual([
    ['cs2', 'esports'],
    ['valorant', 'esports'],
    ['lol', 'esports'],
    ['dota2', 'esports'],
  ])
  expect(BDL_LEAGUES.lpga.sportId).toBe('golf')
  expect(BDL_LEAGUES.mma.sportId).toBe('mma')
  expect(BDL_LEAGUES.atp.titleDateTz).toBe('venue')
  expect(BDL_LEAGUES.epl.titleDateTz).toBe('Europe/London')
  expect(BDL_LEAGUES.dota.titleDateTz).toBe('UTC')
})

it('records per-format safety closes without changing the legacy tennis buffer', () => {
  expect(CLOSE_BUFFER_HOURS.tennis).toBe(6)
  expect(BDL_LEAGUES.atp.closeHoursByBestOf).toEqual({ 3: 3, 5: 5 })
  expect(BDL_LEAGUES.cs.closeHoursByBestOf).toEqual({ 1: 1.5, 3: 4, 5: 6 })
  expect(BDL_LEAGUES.cs.finalsMinutesByBestOf).toEqual({
    1: 45,
    3: 120,
    5: 200,
  })
  expect(BDL_LEAGUES.mma).toMatchObject({
    closeAtStart: false,
    startSignal: 'card-segment-start',
    safetyCloseBasis: 'per-fight-maximum',
    closeBufferHours: null,
  })
  expect(BDL_LEAGUES.pga).toMatchObject({
    safetyCloseBasis: 'final-round-end',
    closeBufferHours: 6,
    finalsFromMinutes: null,
  })
  expect(FINALS_FROM_MINUTES.cbase).toBe(150)
})

it('describes distinct tie rules for each winner market', () => {
  expect(BDL_LEAGUES.mma).toMatchObject({
    tieRule: 'draw-or-no-contest-answer',
    threeWay: true,
  })
  expect(BDL_LEAGUES.nfl).toMatchObject({
    tieRule: 'split-evenly',
    threeWay: false,
  })
  expect(BDL_LEAGUES.epl).toMatchObject({
    tieRule: 'draw-answer',
    threeWay: true,
  })
  expect(BDL_LEAGUES.nhl).toMatchObject({
    tieRule: 'review',
    threeWay: false,
    canEndLevel: false,
  })
})
