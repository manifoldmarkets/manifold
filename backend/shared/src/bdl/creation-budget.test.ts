import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { createMarketProps } from 'common/api/market-types'
import { oddsEventId } from 'common/odds-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import type { SupabaseTransaction } from '../supabase/init'
import {
  BdlBudgetInput,
  BdlCreationLimits,
  inspectBdlCreationBudget,
  requireBdlCreationBudget,
} from './creation-budget'
import { getMajorSettings } from './major-settings'

jest.mock('./major-settings', () => ({
  ...jest.requireActual('./major-settings'),
  getMajorSettings: jest.fn(),
}))
jest.setTimeout(30_000)
const pgp = pgPromise()
let db: PGlite
const statements: string[] = []
const query = async (sql: string, args: unknown[] = []) => {
  statements.push(sql)
  return (await db.query(pgp.as.format(sql, args))).rows[0] ?? null
}
const tx = { one: query, oneOrNone: query } as unknown as SupabaseTransaction
const [house, otherHouse] = MANIFOLD_SPORTS_USER_IDS
const limits = {
  perLeagueDailyAnte: 1000,
  perWaveAnte: 2000,
  globalOpenAnte: 3000,
}
const input: BdlBudgetInput = {
  creatorId: house,
  leagueKey: 'nba',
  waveLeagueKeys: ['nba', 'nhl'],
  expectedBaseAnte: 100,
  limits,
  ante: 100,
}
const fresh = {
  league: 'nba' as const,
  startsOn: '2026-11-20',
  groupSlugs: ['nba'],
  baseAnte: 100,
  waveLeagueKeys: ['nba', 'nhl'] as const,
  limits,
}
const schema = `
  set timezone='America/New_York';
  create table users (id text primary key,balance numeric not null);
  create table contracts (id text primary key,creator_id text not null,token text,resolution text,data jsonb not null,close_time timestamptz);
  create table txns (to_id text,from_id text,from_type text,to_type text,token text,category text,amount numeric not null,created_time timestamptz not null default now());
`
type Charge = {
  id: string
  amount: number
  league?: string | null
  legacy?: string
  provider?: string
  fixture?: boolean
  owner?: string
  from?: string
  to?: string
  token?: string
  ctoken?: string
  category?: string
  fromType?: string
  toType?: string
  resolution?: string
  event?: string | null
  when?: string
}
const month =
  "(date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')"
const nextMonth =
  "((date_trunc('month', now() at time zone 'UTC')+interval '1 month') at time zone 'UTC')"
const day = "(date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')"
const lastMonth = month + "-interval '1 second'"
const charges: Charge[] = [
  { id: 'game', amount: 10, when: day },
  { id: 'resolved', amount: 20, resolution: 'YES' },
  { id: 'wave', amount: 40, league: 'nhl', owner: otherHouse },
  { id: 'old', amount: 80, league: 'mlb', when: lastMonth },
  { id: 'past-open-game', amount: 3, when: lastMonth },
  { id: 'future-open-game', amount: 5, when: nextMonth },
  { id: 'old-resolved', amount: 500, resolution: 'YES', when: lastMonth },
  { id: 'legacy', amount: 11, league: null, legacy: 'NBA' },
  { id: 'other-sport', amount: 7, league: null, legacy: 'Other' },
  { id: 'explicit-league', amount: 13, league: 'mlb', legacy: 'NBA' },
  { id: 'next-period', amount: 400, resolution: 'YES', when: nextMonth },
  { id: 'community', amount: 1000, owner: 'community' },
  { id: 'different-payer', amount: 1000, owner: house, from: otherHouse },
  { id: 'missing-contract', amount: 1000, to: 'absent' },
  { id: 'not-sports', amount: 1000, event: null },
  { id: 'cash-market', amount: 1000, ctoken: 'CASH' },
  { id: 'cash-txn', amount: 1000, token: 'CASH' },
  { id: 'different-category', amount: 1000, category: 'ADD_SUBSIDY' },
  { id: 'wrong-from-type', amount: 1000, fromType: 'BANK' },
  { id: 'wrong-to-type', amount: 1000, toType: 'USER' },
]
function chargeSql(c: Charge) {
  const owner = c.owner ?? house
  const eventId = c.event === undefined ? 'bdl:nba:' + c.id : c.event
  const data = {
    sportsEventId: eventId,
    sportsLeagueKey: c.league === null ? undefined : c.league ?? 'nba',
    sportsLeague: c.legacy,
    sportsProvider: c.provider,
    sportsFixture: c.fixture,
  }
  return (
    pgp.as.format('insert into contracts values ($1,$2,$3,$4,$5);', [
      c.id,
      owner,
      c.ctoken ?? 'MANA',
      c.resolution ?? null,
      data,
    ]) +
    pgp.as.format(
      'insert into txns values ($1,$2,$3,$4,$5,$6,$7,' +
        (c.when ?? 'now()') +
        ');',
      [
        c.to ?? c.id,
        c.from ?? owner,
        c.fromType ?? 'USER',
        c.toType ?? 'CONTRACT',
        c.token ?? 'M$',
        c.category ?? 'CREATE_CONTRACT_ANTE',
        c.amount,
      ]
    )
  )
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(schema)
})
beforeEach(async () => {
  await db.exec('truncate users,contracts,txns')
  await db.exec(
    pgp.as.format('insert into users values ($1,200000),($2,200000)', [
      house,
      otherHouse,
    ])
  )
  jest
    .mocked(getMajorSettings)
    .mockReset()
    .mockResolvedValue({
      ...fresh,
      groupSlugs: [...fresh.groupSlugs],
      waveLeagueKeys: [...fresh.waveLeagueKeys],
    })
  statements.length = 0
})
afterAll(async () => db.close())

it('counts the actual house ante ledger by UTC period, including resolved spend and unresolved legacy exposure', async () => {
  await db.exec(charges.map(chargeSql).join('\n'))
  const status = await inspectBdlCreationBudget(tx, input)
  expect(status).toEqual({
    reason: null,
    dailyAnte: 41,
    waveAnte: 81,
    openAnte: 169,
    balance: 200000,
    remainingBalance: 199900,
    lowBalance: false,
  })
  expect(statements).toHaveLength(1)
  expect(getMajorSettings).not.toHaveBeenCalled()
})

it('applies each UTC cap to an ID-only posted Odds ante at its exact boundary, including after trading closes', async () => {
  // The ordinary authorized writer accepts a canonical Odds ID without league fields.
  const market = createMarketProps.parse({
    question: 'Who wins the earlier NBA game?',
    outcomeType: 'MULTIPLE_CHOICE',
    answers: ['Visitors', 'Hosts'],
    sportsEventId: oddsEventId('basketball_nba', 'first-game'),
    liquidityTier: 100,
  })
  expect(market.sportsLeague).toBeUndefined()
  await db.exec(
    chargeSql({
      id: 'earlier',
      league: null,
      event: market.sportsEventId,
      amount: 75,
      when: day,
    })
  )
  await db.exec("update contracts set close_time=now()-interval '1 minute'")
  for (const [field, reason] of [
    ['perLeagueDailyAnte', 'league-daily-cap'],
    ['perWaveAnte', 'wave-monthly-cap'],
    ['globalOpenAnte', 'global-open-cap'],
  ] as const) {
    for (const cap of [175, 174.99]) {
      const capped = { ...limits, [field]: cap }
      const expected = {
        reason: cap === 175 ? null : reason,
        dailyAnte: 75,
        waveAnte: 75,
        openAnte: 75,
      }
      const request = { ...input, limits: capped }
      await expect(
        inspectBdlCreationBudget(tx, request)
      ).resolves.toMatchObject(expected)
      jest
        .mocked(getMajorSettings)
        .mockResolvedValueOnce({
          ...fresh,
          waveLeagueKeys: [...fresh.waveLeagueKeys],
          limits: capped,
        })
      if (cap === 175)
        await expect(
          requireBdlCreationBudget(tx, request)
        ).resolves.toMatchObject(expected)
      else
        await expect(
          requireBdlCreationBudget(tx, request)
        ).rejects.toMatchObject({ status: expected })
    }
  }
  await db.exec("update contracts set resolution='YES'")
  await expect(inspectBdlCreationBudget(tx, input)).resolves.toMatchObject({
    dailyAnte: 75,
    waveAnte: 75,
    openAnte: 0,
  })
  expect((await db.query('select amount from txns')).rows).toHaveLength(1)
})

it('attributes each posted debit once across explicit keys, canonical Odds events and display labels', async () => {
  const nba = oddsEventId('basketball_nba', 'earlier')
  const charged: Charge[] = [
    { id: 'agrees', event: nba, league: 'nba', legacy: 'NBA', amount: 10 },
    {
      id: 'other-account',
      event: nba,
      league: null,
      owner: otherHouse,
      amount: 10,
    },
    {
      id: 'signed-league',
      event: nba,
      league: 'mlb',
      legacy: 'NBA',
      amount: 20,
    },
    {
      id: 'odds-before-label',
      event: oddsEventId('icehockey_nhl', 'hockey'),
      league: null,
      legacy: 'NBA',
      amount: 30,
    },
    {
      id: 'legacy-only',
      event: 'old-unscoped-id',
      league: null,
      legacy: 'NBA',
      amount: 40,
    },
    {
      id: 'recognized-alias',
      event: oddsEventId('americanfootball_nfl_preseason', 'friendly'),
      league: null,
      amount: 50,
    },
    { id: 'old-closed', event: nba, league: null, amount: 70, when: lastMonth },
    {
      id: 'paid-final',
      event: nba,
      league: null,
      amount: 80,
      resolution: 'YES',
    },
    {
      id: 'wrong-payer',
      event: nba,
      league: null,
      from: otherHouse,
      amount: 500,
    },
    { id: 'community', event: nba, league: null, owner: 'other', amount: 500 },
  ]
  await db.exec(charged.map(chargeSql).join('\n'))
  await db.exec(
    "update contracts set close_time=now()-interval '1 month' where id='old-closed'"
  )
  const expected = { nba: 140, nhl: 30, mlb: 20, nfl: 50 } as const
  for (const leagueKey of ['nba', 'nhl', 'mlb', 'nfl'] as const) {
    await expect(
      inspectBdlCreationBudget(tx, {
        ...input,
        leagueKey,
        waveLeagueKeys: [leagueKey],
      })
    ).resolves.toMatchObject({
      dailyAnte: expected[leagueKey],
      waveAnte: expected[leagueKey],
      openAnte: 230,
    })
  }
  await expect(inspectBdlCreationBudget(tx, input)).resolves.toMatchObject({
    dailyAnte: 140,
    waveAnte: 170,
    openAnte: 230,
  })
})

it.each([
  ['wrong explicit provider', 'odds:basketball_nba:one', 'bdl', false],
  ['fixture provider', 'odds:basketball_nba:one', 'fixture', false],
  ['marked fixture', 'odds:basketball_nba:one', 'odds', true],
  ['unsupported feed', 'odds:basketball_nba_extra:one', 'odds', false],
  ['empty event', 'odds:basketball_nba:', undefined, false],
  ['extra suffix', 'odds:basketball_nba:one:prop', undefined, false],
  ['trailing newline', 'odds:basketball_nba:one\n', undefined, false],
  ['other namespace', 'fixture:basketball_nba:one', undefined, false],
] as const)(
  'keeps actually posted exposure without inferring the NBA from %s',
  async (_, event, provider, fixture) => {
    await db.exec(
      chargeSql({
        id: 'unsupported',
        event,
        provider,
        fixture,
        league: null,
        amount: 21,
      })
    )
    await expect(inspectBdlCreationBudget(tx, input)).resolves.toMatchObject({
      dailyAnte: 0,
      waveAnte: 0,
      openAnte: 21,
    })
  }
)

it('compares exact numeric costs including earlier dry-run proposals', async () => {
  await db.exec(chargeSql({ id: 'fraction', amount: 0.1 }))
  const preview = { dailyAnte: 1, waveAnte: 2, openAnte: 3, balanceDebits: 4 }
  const status = await inspectBdlCreationBudget(
    tx,
    {
      ...input,
      ante: 0.2,
      limits: {
        perLeagueDailyAnte: 1.3,
        perWaveAnte: 2.3,
        globalOpenAnte: 3.3,
      },
    },
    preview
  )
  expect(status).toMatchObject({
    reason: null,
    dailyAnte: 1.1,
    waveAnte: 2.1,
    openAnte: 3.1,
    balance: 199996,
    remainingBalance: 199995.8,
  })
})

it.each([
  ['perLeagueDailyAnte', 'league-daily-cap'],
  ['perWaveAnte', 'wave-monthly-cap'],
  ['globalOpenAnte', 'global-open-cap'],
] as const)(
  'enforces the latest configured %s, including a zero limit',
  async (key, reason) => {
    for (const cap of [0, 99.99]) {
      jest.mocked(getMajorSettings).mockResolvedValueOnce({
        ...fresh,
        groupSlugs: [...fresh.groupSlugs],
        waveLeagueKeys: [...fresh.waveLeagueKeys],
        limits: { ...limits, [key]: cap },
      })
      await expect(requireBdlCreationBudget(tx, input)).rejects.toMatchObject({
        status: { reason },
      })
    }
    const atLimit = { ...limits, [key]: 100 }
    await expect(
      inspectBdlCreationBudget(tx, { ...input, limits: atLimit })
    ).resolves.toMatchObject({ reason: null })
  }
)

it('serializes distinct creators before rereading the payer and current settings', async () => {
  jest.mocked(getMajorSettings).mockImplementationOnce(async () => {
    expect(statements).toHaveLength(2)
    expect(statements[0]).toBe(
      "select pg_advisory_xact_lock(hashtext('sports-creation-budget'))"
    )
    expect(statements[1]).toContain('for update')
    return {
      ...fresh,
      groupSlugs: [...fresh.groupSlugs],
      waveLeagueKeys: [...fresh.waveLeagueKeys].reverse(),
    }
  })
  await expect(requireBdlCreationBudget(tx, input)).resolves.toMatchObject({
    reason: null,
  })
  expect(getMajorSettings).toHaveBeenCalledWith(tx, 'nba')
})

it('fails closed on missing limits, removed settings, changed ante or changed wave members', async () => {
  for (const key of Object.keys(limits) as (keyof BdlCreationLimits)[]) {
    await expect(
      inspectBdlCreationBudget(tx, {
        ...input,
        limits: { ...limits, [key]: null },
      })
    ).resolves.toMatchObject({ reason: 'budget-unconfigured' })
  }
  jest.mocked(getMajorSettings).mockResolvedValueOnce(null)
  await expect(requireBdlCreationBudget(tx, input)).rejects.toMatchObject({
    status: { reason: 'budget-unconfigured' },
  })
  for (const change of [
    { baseAnte: 130 },
    { waveLeagueKeys: ['nba'] as const },
    { waveLeagueKeys: ['nba', 'nfl'] as const },
  ]) {
    jest.mocked(getMajorSettings).mockResolvedValueOnce({
      ...fresh,
      ...change,
      groupSlugs: [],
      waveLeagueKeys: [...(change.waveLeagueKeys ?? fresh.waveLeagueKeys)],
    })
    await expect(requireBdlCreationBudget(tx, input)).rejects.toMatchObject({
      status: { reason: 'settings-changed' },
    })
  }
})

it('reports low projected balance and stops the debit if the selected ante is unaffordable', async () => {
  await db.exec('update users set balance=100100')
  await expect(inspectBdlCreationBudget(tx, input)).resolves.toMatchObject({
    reason: null,
    lowBalance: false,
  })
  await db.exec('update users set balance=100')
  await expect(requireBdlCreationBudget(tx, input)).resolves.toMatchObject({
    reason: null,
    remainingBalance: 0,
    lowBalance: true,
  })
  await db.exec('update users set balance=99.99')
  await expect(requireBdlCreationBudget(tx, input)).rejects.toMatchObject({
    status: { reason: 'low-balance', lowBalance: true },
  })
})

it('rejects unauthorized accounts and invalid bounds, projections, balances or antes before spending', async () => {
  for (const params of [
    { ...input, creatorId: 'someone' },
    { ...input, ante: NaN },
    { ...input, ante: 0 },
    { ...input, expectedBaseAnte: Infinity },
    { ...input, expectedBaseAnte: -1 },
    { ...input, waveLeagueKeys: [] },
    { ...input, limits: { ...limits, perWaveAnte: -1 } },
    { ...input, limits: { ...limits, perWaveAnte: Infinity } },
  ])
    await expect(requireBdlCreationBudget(tx, params)).rejects.toThrow()
  await expect(
    inspectBdlCreationBudget(tx, input, {
      dailyAnte: 0,
      waveAnte: NaN,
      openAnte: 0,
      balanceDebits: 0,
    })
  ).rejects.toThrow('Invalid BDL creation budget')
  expect(statements).toEqual([])
  await db.exec("update users set balance='NaN'")
  await expect(requireBdlCreationBudget(tx, input)).rejects.toThrow('Nonfinite')
  await db.exec('delete from users')
  await expect(requireBdlCreationBudget(tx, input)).rejects.toThrow('missing')
})
