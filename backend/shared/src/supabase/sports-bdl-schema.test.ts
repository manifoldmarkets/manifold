import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import { BDL_REQUESTS_PER_MINUTE } from 'common/bdl/constants'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { findSportsMarket } from '../sports-market-dedupe'

jest.mock('./init', () => ({ pgp: jest.requireActual('pg-promise')() }))
jest.setTimeout(30_000)

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/2026112101_sports_bdl_schema.sql'
  ),
  'utf8'
)
const pgp = pgPromise()
const stats = 'public.sports_bdl_request_stats'
const index = 'contracts_sports_event_id_idx'
const schema = `
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to public, anon, authenticated, service_role;
  create table public.contracts (id text primary key, creator_id text not null, token text not null, resolution text, data jsonb not null);
`
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(schema)
  await db.exec(migration)
})
afterAll(async () => db.close())

// Capture the production query, including its bound creator allowlist and legacy CANCEL branch.
async function lookup(eventId: string, includeCanceled: boolean) {
  const capture = jest.fn().mockResolvedValue(null)
  await findSportsMarket(
    { oneOrNone: capture },
    eventId,
    'moneyline',
    includeCanceled
  )
  const [sql, params] = capture.mock.calls[0] as [string, unknown[]]
  return { sql, params }
}
it('keeps the official lookup index sparse across game providers, resolutions and tokens', async () => {
  await db.exec(`insert into public.contracts
    select 'filler-'||i,'reader','MANA',null,case when i%20=0 then jsonb_build_object('sportsEventId','odds:old-'||i) else '{}'::jsonb end
    from generate_series(1,6000) i`)
  const events = [
    ['canceled', 'bdl:nba:10', MANIFOLD_SPORTS_USER_IDS[0], 'CANCEL'],
    ['legacy', 'odds:basketball_nba:old', MANIFOLD_SPORTS_USER_IDS[1], null],
  ] as const
  for (const [id, eventId, creator, resolution] of events) {
    await db.query('insert into contracts values ($1,$2,$3,$4,$5)', [
      id,
      creator,
      'MANA',
      resolution,
      JSON.stringify({ sportsEventId: eventId, sportsMarketType: 'moneyline' }),
    ])
  }
  await db.exec('analyze contracts')
  const catalog = await db.query<{ predicate: string }>(
    `select pg_get_expr(indpred,indrelid) as predicate from pg_index where indexrelid='public.contracts_sports_event_id_idx'::regclass`
  )
  expect(catalog.rows[0].predicate).toMatch(/sportsEventId.*IS NOT NULL/i)
  let sequence = 0
  for (const [id, eventId] of events) {
    for (const includeCanceled of [false, true]) {
      const { sql, params } = await lookup(eventId, includeCanceled)
      const literal = pgp.as.format(sql, params)
      const expected = id === 'canceled' && !includeCanceled ? [] : [{ id }]
      expect((await db.query(literal)).rows).toEqual(expected)
      const plan = (statement: string) =>
        db.query<{ 'QUERY PLAN': unknown }>(
          'explain (format json,costs off) ' + statement
        )
      expect(JSON.stringify((await plan(literal)).rows)).toContain(index)
      const name = 'sports_lookup_' + ++sequence
      await db.exec('set plan_cache_mode=force_generic_plan')
      await db.exec('prepare ' + name + '(text,text[],text) as ' + sql)
      const prepared = pgp.as.format('execute ' + name + '($1,$2,$3)', params)
      expect(JSON.stringify((await plan(prepared)).rows)).toContain(index)
      expect((await db.query(prepared)).rows).toEqual(expected)
    }
  }
})
const when = '2026-11-21T00:03:00Z'
const success = '2026-11-21T00:01:00Z'
const good = {
  league_key: 'nba',
  endpoint_template: 'v1/games/{id}',
  process_role: 'scheduler',
  success_count: 1,
  unauthorized_count: 0,
  rate_limited_count: 0,
  other_count: 0,
  last_status: 200,
  last_request_at: when,
  last_success_at: success,
  quota_limit: 600,
  quota_remaining: 300,
}
type Change = Partial<Record<keyof typeof good, string | number | null>>
const insertStats = (change: Change = {}) =>
  pgp.helpers.insert({ ...good, ...change }, undefined, {
    schema: 'public',
    table: 'sports_bdl_request_stats',
  })

const invalid: [string, Change, string][] = [
  ['unsupported league', { league_key: 'imaginary' }, '23514'],
  ['unknown role', { process_role: 'frontend' }, '23514'],
  ['raw URL', { endpoint_template: 'https://api.example/v1/games' }, '23514'],
  ['leading slash', { endpoint_template: '/v1/games' }, '23514'],
  ['missing version', { endpoint_template: 'games/{id}' }, '23514'],
  ['literal game id', { endpoint_template: 'v1/games/12345' }, '23514'],
  ['query value', { endpoint_template: 'v1/games?cursor=1' }, '23514'],
  ['unknown placeholder', { endpoint_template: 'v1/games/{secret}' }, '23514'],
  [
    'oversize template',
    { endpoint_template: 'v1/' + 'a'.repeat(126) },
    '23514',
  ],
  [
    'negative successes',
    {
      success_count: -1,
      last_success_at: null,
      last_status: 500,
      other_count: 1,
    },
    '23514',
  ],
  ['negative 401s', { unauthorized_count: -1 }, '23514'],
  ['negative 429s', { rate_limited_count: -1 }, '23514'],
  ['negative other', { other_count: -1 }, '23514'],
  ['negative quota limit', { quota_limit: -1 }, '23514'],
  ['negative quota remaining', { quota_remaining: -1 }, '23514'],
  ['status below HTTP range', { last_status: 99, other_count: 1 }, '23514'],
  ['status above HTTP range', { last_status: 600, other_count: 1 }, '23514'],
  ['missing successful timestamp', { last_success_at: null }, '23514'],
  [
    'success timestamp without success',
    { last_status: 500, other_count: 1, success_count: 0 },
    '23514',
  ],
  [
    'success in the future',
    { last_success_at: '2026-11-21T00:04:00Z' },
    '23514',
  ],
  ['2xx counter missing', { success_count: 0, last_success_at: null }, '23514'],
  ['401 counter missing', { last_status: 401 }, '23514'],
  ['429 counter missing', { last_status: 429 }, '23514'],
  ['other status counter missing', { last_status: 503 }, '23514'],
  ...(
    [
      'league_key',
      'process_role',
      'endpoint_template',
      'success_count',
      'unauthorized_count',
      'rate_limited_count',
      'other_count',
      'last_status',
      'last_request_at',
    ] as const
  ).map((key): [string, Change, string] => [
    'null ' + key,
    { [key]: null },
    '23502',
  ]),
]
beforeEach(async () => {
  await db.exec('truncate ' + stats)
})
it.each(invalid)('rejects %s', async (_name, change, code) => {
  await expect(db.exec(insertStats(change))).rejects.toMatchObject({ code })
})

it('accepts all registry leagues and process roles, status classes and unavailable quota headers', async () => {
  for (const league_key of Object.keys(BDL_LEAGUES))
    await db.exec(insertStats({ league_key }))
  for (const process_role of Object.keys(BDL_REQUESTS_PER_MINUTE))
    await db.exec(
      insertStats({ process_role, endpoint_template: 'v2/players/{id}' })
    )
  const statuses = [
    100, 199, 200, 299, 300, 400, 401, 402, 428, 429, 430, 500, 599,
  ]
  for (const status of statuses) {
    const key = 'v1/status/' + 'x'.repeat(statuses.indexOf(status) + 1)
    const counts = {
      success_count: 0,
      unauthorized_count: 0,
      rate_limited_count: 0,
      other_count: 0,
    }
    const isSuccess = status >= 200 && status < 300
    if (isSuccess) counts.success_count = 1
    else if (status === 401) counts.unauthorized_count = 1
    else if (status === 429) counts.rate_limited_count = 1
    else counts.other_count = 1
    await db.exec(
      insertStats({
        endpoint_template: key,
        last_status: status,
        ...counts,
        last_success_at: isSuccess ? when : null,
        quota_limit: null,
        quota_remaining: null,
      })
    )
  }
  for (const suffix of ['{category}', '{type}'])
    await db.exec(insertStats({ endpoint_template: 'v1/games/' + suffix }))
  const res = await db.query<{ count: number }>(
    `select count(*)::int as count from ${stats} where last_status in (401,429) and last_success_at is null`
  )
  expect(res.rows).toEqual([{ count: 2 }])
})

it('retains one row per league, endpoint and role when the migration is reapplied', async () => {
  await db.exec(insertStats())
  await expect(db.exec(insertStats())).rejects.toMatchObject({ code: '23505' })
  for (const extra of [
    { league_key: 'nhl' },
    { endpoint_template: 'v2/games/{id}' },
    { process_role: 'api' },
  ])
    await db.exec(insertStats(extra))
  const objects = () =>
    db.query(
      `select oid::text from pg_class where oid in ('${stats}'::regclass,'public.${index}'::regclass) order by oid`
    )
  const before = (await objects()).rows
  await db.exec(migration)
  expect((await objects()).rows).toEqual(before)
  expect(
    (await db.query(`select count(*)::int as count from ${stats}`)).rows
  ).toEqual([{ count: 4 }])
})

it('rolls back the whole telemetry transaction on an invalid observation', async () => {
  await expect(
    db.transaction(async (tx) => {
      await tx.exec(insertStats())
      await tx.exec(insertStats({ process_role: 'api', quota_remaining: -1 }))
    })
  ).rejects.toMatchObject({ code: '23514' })
  expect(
    (await db.query('select count(*)::int as count from ' + stats)).rows
  ).toEqual([{ count: 0 }])
})

it('denies client access including truncate and lets the backend maintain aggregates', async () => {
  const security = await db.query<{
    enabled: boolean
    policies: number
  }>(`select relrowsecurity as enabled,
    (select count(*)::int from pg_policy where polrelid=c.oid) as policies from pg_class c where oid='${stats}'::regclass`)
  expect(security.rows).toEqual([{ enabled: true, policies: 0 }])
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const acl = await db.query<{ privilege: string; allowed: boolean }>(
      `select privilege,has_table_privilege($1,$2,privilege) as allowed
      from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) as p(privilege)`,
      [role, stats]
    )
    expect(acl.rows.filter((r) => r.allowed).map((r) => r.privilege)).toEqual(
      role === 'service_role' ? ['SELECT', 'INSERT', 'UPDATE'] : []
    )
  }
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role)
    try {
      for (const denied of [
        'select * from ' + stats,
        insertStats(),
        'truncate ' + stats,
      ])
        await expect(db.exec(denied)).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('reset role')
    }
  }
  await db.exec('set role service_role')
  try {
    await db.exec(insertStats())
    await db.exec(`update ${stats} set success_count=success_count+1`)
    expect(
      (await db.query('select success_count::int as count from ' + stats)).rows
    ).toEqual([{ count: 2 }])
    await expect(db.exec('delete from ' + stats)).rejects.toMatchObject({
      code: '42501',
    })
  } finally {
    await db.exec('reset role')
  }
})

it('starts unobserved counts at zero and preserves a failed-only endpoint without quota or a success time', async () => {
  await db.exec(`insert into ${stats} (league_key,endpoint_template,process_role,unauthorized_count,last_status,last_request_at)
    values ('nba','v1/standings','scheduler',1,401,'2026-11-21T00:00:00Z')`)
  const result = await db.query(
    `select success_count::int,unauthorized_count::int,rate_limited_count::int,other_count::int,last_success_at,quota_limit,quota_remaining from ${stats}`
  )
  expect(result.rows).toEqual([
    {
      success_count: 0,
      unauthorized_count: 1,
      rate_limited_count: 0,
      other_count: 0,
      last_success_at: null,
      quota_limit: null,
      quota_remaining: null,
    },
  ])
})
