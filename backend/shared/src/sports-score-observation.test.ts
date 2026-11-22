import { PGlite } from '@electric-sql/pglite'
import type { MarketContract } from 'common/contract'
import type { SportsLiveScore } from 'common/sports-schedule'
import type { SupabaseDirectClient } from './supabase/init'
import {
  assertObservedResult,
  boundScore,
  confirmedTournamentAnswer,
  ScoreSource,
  writeFixtureScore,
} from './sports-score-observation'

jest.setTimeout(30_000)
const db = new PGlite()
beforeAll(() =>
  db.exec(`create table contracts(id text primary key,creator_id text,token text,resolution text,visibility text,deleted boolean,data jsonb);
  create table answers(id text primary key,contract_id text,text text,index int,resolution text,resolution_time timestamptz);`)
)
afterAll(() => db.close())
const pg = {
  tx: <T>(f: (tx: unknown) => Promise<T>) =>
    db.transaction((tx) =>
      f({
        manyOrNone: async (sql: string, params: unknown[]) =>
          (await tx.query(sql, params)).rows,
        none: (sql: string, params: unknown[]) => tx.query(sql, params),
      })
    ),
} as unknown as SupabaseDirectClient
const source: ScoreSource = {
  provider: 'odds',
  creatorId: 'sports',
  league: 'NFL',
  eventId: 'odds:americanfootball_nfl:one',
  home: 'Home',
  away: 'Away',
}
const tournament: ScoreSource = {
  ...source,
  provider: 'football-data',
  league: 'World Cup',
  eventId: 'fd-367',
}
const live: SportsLiveScore = {
  sportsHomeScore: 1,
  sportsAwayScore: 0,
  sportsLiveStatus: 'IN_PLAY',
  sportsLiveMinute: null,
  sportsLiveUpdatedTime: 100,
}
const final: SportsLiveScore = {
  ...live,
  sportsLiveStatus: 'FINISHED',
  sportsLiveUpdatedTime: 200,
}
async function seed(
  s = source,
  extra: Record<string, unknown> = {},
  teams = ['Home', 'Away', 'Draw']
) {
  const data = {
    id: 'm',
    creatorId: 'sports',
    token: 'MANA',
    visibility: 'public',
    isResolved: false,
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    sportsEventId: s.eventId,
    sportsLeague: s.league,
    ...(s.provider === 'odds'
      ? { sportsHomeTeam: s.home, sportsAwayTeam: s.away }
      : {}),
    ...extra,
  }
  await db.exec('truncate contracts,answers')
  await db.query(
    'insert into contracts values ($1,$2,$3,null,$4,false,$5::jsonb)',
    [
      'm',
      data.creatorId,
      data.token,
      data.visibility,
      JSON.stringify({ ...data, token: undefined }),
    ]
  )
  for (const [index, text] of teams.entries())
    await db.query('insert into answers values($1,$2,$3,$4,null,null)', [
      String(index),
      'm',
      text,
      index,
    ])
}
async function current() {
  const row = (
    await db.query<{ data: Record<string, unknown>; token: string }>(
      'select data,token from contracts'
    )
  ).rows[0]
  const answers = (await db.query('select * from answers order by index')).rows
  return { ...row.data, token: row.token, answers } as unknown as MarketContract
}
it.each([
  ['reassigned event', { sportsEventId: 'odds:americanfootball_nfl:two' }],
  ['reversed sides', { sportsHomeTeam: 'Away', sportsAwayTeam: 'Home' }],
  ['changed entrant', { sportsHomeTeamId: 'replacement' }],
  ['conflicting provider', { sportsProvider: 'bdl' }],
  ['unrelated league', { sportsLeague: 'NHL' }],
  ['community account', { creatorId: 'community' }],
  ['fixture', { sportsFixture: true }],
  ['prop', { sportsMarketType: 'prop' }],
  ['independent answers', { shouldAnswersSumToOne: false }],
  ['resolved', { isResolved: true }],
] as const)(
  'an Odds observation cannot attach to a %s',
  async (_label, change) => {
    await seed(source, change)
    await expect(
      writeFixtureScore(pg, source, final, 150, 'm')
    ).resolves.toEqual([])
    expect(await current()).not.toHaveProperty('sportsLiveStatus')
  }
)
it('writes and publishes the observed sides, then requires the same fixture, answer identities and result at payout', async () => {
  await seed()
  const [written] = await writeFixtureScore(pg, source, final, 150, 'm')
  expect(written.id).toBe('m')
  expect(boundScore(source, final).scoreFixture).toMatchObject({
    eventId: source.eventId,
    home: 'Home',
    away: 'Away',
  })
  const original = await current()
  expect(() =>
    assertObservedResult(original, source, final, written.answers)
  ).not.toThrow()
  for (const change of [
    { sportsEventId: 'odds:americanfootball_nfl:two' },
    { sportsHomeTeam: 'Elsewhere' },
    { sportsHomeScore: 0 },
    { sportsLiveUpdatedTime: 201 },
    { sportsLiveStatus: 'IN_PLAY' },
  ]) {
    expect(() =>
      assertObservedResult(
        Object.assign({}, original, change),
        source,
        final,
        written.answers
      )
    ).toThrow()
  }
  await db.query("update answers set id='replacement-answer' where id='0'")
  const changed = await current()
  expect(() =>
    assertObservedResult(changed, source, final, written.answers)
  ).toThrow()
})
it('rejects a late overlapping read, a tied receipt and any in-play update after the provider final', async () => {
  await seed()
  expect(await writeFixtureScore(pg, source, live, 80)).toHaveLength(1)
  for (const [start, end] of [
    [85, 110],
    [100, 100],
  ])
    expect(
      await writeFixtureScore(
        pg,
        source,
        { ...live, sportsLiveUpdatedTime: end },
        start
      )
    ).toHaveLength(0)
  expect(await writeFixtureScore(pg, source, final, 101)).toHaveLength(1)
  expect(
    await writeFixtureScore(
      pg,
      source,
      { ...live, sportsLiveUpdatedTime: 300 },
      205
    )
  ).toHaveLength(0)
  expect(await current()).toMatchObject({
    sportsLiveStatus: 'FINISHED',
    sportsLiveUpdatedTime: 200,
  })
})
it('matches a historical tournament market through its authoritative flag-prefixed, ordered answers', async () => {
  await seed(tournament, {}, ['🇬🇧 Home', '🇦🇺 Away', 'Draw'])
  expect(
    await writeFixtureScore(
      pg,
      tournament,
      { ...final, sportsHomeScore: null, sportsAwayScore: null },
      150
    )
  ).toHaveLength(1)
  expect(await current()).toMatchObject({
    sportsLiveStatus: 'FINISHED',
    sportsHomeScore: null,
  })
  for (const names of [
    ['🇦🇺 Away', '🇬🇧 Home', 'Draw'],
    ['Home', 'Home', 'Draw'],
    ['Other Home', 'Away', 'Draw'],
    ['Home', 'Away', 'Another'],
  ]) {
    await seed(tournament, {}, names)
    expect(await writeFixtureScore(pg, tournament, final, 150)).toHaveLength(0)
  }
})

it('does not settle individually resolved or timestamped native answers', async () => {
  for (const [column, value] of [
    ['resolution', 'YES'],
    ['resolution_time', '2026-11-22T12:00:00Z'],
  ]) {
    await seed()
    const [w] = await writeFixtureScore(pg, source, final, 150)
    await db.query(`update answers set ${column}=$1 where id='0'`, [value])
    const answers = (
      await db.query(
        'select *,extract(epoch from resolution_time)*1000 as "resolutionTime" from answers'
      )
    ).rows
    const c = { ...(await current()), answers } as unknown as MarketContract
    expect(() => assertObservedResult(c, source, final, w.answers)).toThrow()
    await expect(
      writeFixtureScore(
        pg,
        source,
        { ...final, sportsLiveUpdatedTime: 310 },
        300
      )
    ).resolves.toEqual([])
  }
})

it.each([
  ['sportsHomeScore', -1],
  ['sportsAwayScore', 1.5],
  ['sportsHomeScore', NaN],
  ['sportsAwayScore', Infinity],
  ['sportsHomeScore', '2'],
  ['sportsAwayScore', undefined],
  ['sportsPenHome', -2],
  ['sportsPenAway', 0.25],
  ['sportsPenHome', '4'],
] as const)(
  'rejects malformed %s %p before opening a score transaction',
  async (field, value) => {
    const tx = jest.fn()
    await expect(
      writeFixtureScore(
        { tx } as unknown as SupabaseDirectClient,
        tournament,
        { ...final, [field]: value },
        150
      )
    ).resolves.toEqual([])
    expect(tx).not.toHaveBeenCalled()
  }
)

it('honors genuine provider chronology for Odds, with local acquisition order as the fallback when either provider time is missing', async () => {
  await seed()
  const write = (
    start: number,
    receipt: number,
    providerTime: number | null,
    home: number
  ) =>
    writeFixtureScore(
      pg,
      source,
      {
        ...final,
        sportsScoreUpdatedTime: providerTime,
        sportsLiveUpdatedTime: receipt,
        sportsHomeScore: home,
      },
      start
    )
  expect(await write(90, 100, 87, 2)).toHaveLength(1)
  expect(await write(110, 120, 85, 0)).toHaveLength(0)
  expect(await current()).toMatchObject({
    sportsHomeScore: 2,
    sportsLiveUpdatedTime: 100,
  })
  expect(await write(130, 140, null, 1)).toHaveLength(1)
  expect(await write(150, 160, 120, 3)).toHaveLength(1)
})

it('permits the first current observation for a reassigned fixture and removes the former final and decider atomically', async () => {
  await seed()
  await writeFixtureScore(
    pg,
    source,
    {
      ...final,
      sportsLiveClock: 'FT',
      sportsScoreDuration: 'PENALTY_SHOOTOUT',
      sportsPenHome: 5,
      sportsPenAway: 3,
    },
    150
  )
  const replacement = { ...source, eventId: 'odds:americanfootball_nfl:two' }
  await db.query('update contracts set data=data || $1::jsonb', [
    JSON.stringify({ sportsEventId: replacement.eventId }),
  ])
  expect(
    await writeFixtureScore(
      pg,
      source,
      { ...live, sportsLiveUpdatedTime: 210 },
      205
    )
  ).toHaveLength(0)
  const [accepted] = await writeFixtureScore(
    pg,
    replacement,
    { ...live, sportsLiveUpdatedTime: 210 },
    205
  )
  expect(accepted).toMatchObject({ old_home: null, old_away: null })
  expect(await current()).toMatchObject({
    scoreFixture: { eventId: replacement.eventId },
    sportsLiveStatus: 'IN_PLAY',
    sportsLiveClock: null,
    sportsScoreDuration: null,
    sportsPenHome: null,
    sportsPenAway: null,
  })
})

const knockoutAnswers = [
  { id: '01', text: 'Equatorial Guinea', index: 1 },
  { id: '02', text: 'Guinea', index: 0 },
]
const groupAnswers = [...knockoutAnswers, { id: '03', text: 'Draw', index: 2 }]
const scored = {
  ...final,
  sportsScoreWinner: 'HOME_TEAM' as const,
  sportsScoreDuration: 'REGULAR',
}
it.each([
  ['home', groupAnswers, {}, '02'],
  [
    'away',
    groupAnswers,
    { sportsScoreWinner: 'AWAY_TEAM', sportsHomeScore: 0, sportsAwayScore: 1 },
    '01',
  ],
  [
    'group draw',
    groupAnswers,
    { sportsHomeScore: 0, sportsScoreWinner: 'DRAW' },
    '03',
  ],
  [
    'knockout draw',
    knockoutAnswers,
    { sportsHomeScore: 0, sportsScoreWinner: 'DRAW' },
    undefined,
  ],
  [
    'contradictory winner',
    groupAnswers,
    { sportsScoreWinner: 'AWAY_TEAM' },
    undefined,
  ],
  [
    'unknown winner',
    groupAnswers,
    { sportsHomeScore: 0, sportsScoreWinner: 'UNKNOWN' },
    undefined,
  ],
  ['no winner', groupAnswers, { sportsScoreWinner: null }, undefined],
  ['scored award', groupAnswers, { sportsLiveStatus: 'AWARDED' }, '02'],
  [
    'scoreless award',
    groupAnswers,
    {
      sportsLiveStatus: 'AWARDED',
      sportsHomeScore: null,
      sportsAwayScore: null,
    },
    undefined,
  ],
  ['extra time', knockoutAnswers, { sportsScoreDuration: 'EXTRA_TIME' }, '02'],
  [
    'unexpected extra time',
    groupAnswers,
    { sportsScoreDuration: 'EXTRA_TIME' },
    undefined,
  ],
  ['unexpected penalties', knockoutAnswers, { sportsPenHome: 4 }, undefined],
  [
    'shootout',
    knockoutAnswers,
    {
      sportsScoreDuration: 'PENALTY_SHOOTOUT',
      sportsHomeScore: 0,
      sportsPenHome: 5,
      sportsPenAway: 3,
    },
    '02',
  ],
  [
    'missing shootout score',
    knockoutAnswers,
    {
      sportsScoreDuration: 'PENALTY_SHOOTOUT',
      sportsHomeScore: 0,
      sportsPenHome: 5,
    },
    undefined,
  ],
  [
    'level shootout',
    knockoutAnswers,
    {
      sportsScoreDuration: 'PENALTY_SHOOTOUT',
      sportsHomeScore: 0,
      sportsPenHome: 4,
      sportsPenAway: 4,
    },
    undefined,
  ],
  [
    'contradictory shootout',
    knockoutAnswers,
    {
      sportsScoreDuration: 'PENALTY_SHOOTOUT',
      sportsHomeScore: 0,
      sportsPenHome: 3,
      sportsPenAway: 5,
    },
    undefined,
  ],
  [
    'decided before shootout',
    knockoutAnswers,
    {
      sportsScoreDuration: 'PENALTY_SHOOTOUT',
      sportsPenHome: 5,
      sportsPenAway: 3,
    },
    undefined,
  ],
  [
    'unknown duration',
    knockoutAnswers,
    { sportsScoreDuration: 'UNKNOWN' },
    undefined,
  ],
] as const)(
  'checks %s against the scored result and the ordered native market',
  (name, answers, patch, result) => {
    expect(
      confirmedTournamentAnswer(
        { ...scored, ...patch } as typeof scored,
        answers
      )?.id
    ).toBe(result)
  }
)

it('checks the stored winning side, decision method and penalty goals again at the money boundary', async () => {
  await seed(tournament, {}, ['Home', 'Away'])
  const patch = {
    ...scored,
    sportsScoreDuration: 'PENALTY_SHOOTOUT',
    sportsHomeScore: 0,
    sportsPenHome: 5,
    sportsPenAway: 3,
  }
  const [written] = await writeFixtureScore(pg, tournament, patch, 150)
  const original = await current()
  expect(() =>
    assertObservedResult(original, tournament, patch, written.answers)
  ).not.toThrow()
  for (const change of [
    { sportsScoreWinner: 'AWAY_TEAM' },
    { sportsScoreDuration: 'REGULAR' },
    { sportsPenHome: 3 },
    { sportsPenAway: 5 },
    { scoreFixture: undefined },
  ]) {
    expect(() =>
      assertObservedResult(
        { ...original, ...change } as MarketContract,
        tournament,
        patch,
        written.answers
      )
    ).toThrow()
  }
})
