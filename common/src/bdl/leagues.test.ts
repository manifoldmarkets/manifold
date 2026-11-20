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
    expect(league.perRunCap).toBe(0)
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
    sportKey: 'baseball',
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
