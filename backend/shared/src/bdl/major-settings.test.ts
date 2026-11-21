import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { MajorSettingRow } from 'common/bdl/major-leagues'
import type { SupabaseDirectClient } from '../supabase/init'
import { creationSettings, getMajorSettings } from './major-settings'
jest.setTimeout(30_000)

const pgp = pgPromise()
const ddl = (name: string) =>
  readFileSync(resolve(__dirname, '../../../supabase', name), 'utf8')
let db: PGlite
const pg = {
  manyOrNone: async (sql: string, params?: unknown[]) =>
    (await db.query(pgp.as.format(sql, params))).rows,
} as unknown as Pick<SupabaseDirectClient, 'manyOrNone'>
function seed(setting: MajorSettingRow) {
  return db.query(
    pgp.as.format(
      "insert into sports_bdl_creation_settings (scope,ante_cap,base_ante,cutover_date,group_slugs,updated_by) values ($1,$2,$3,$4,$5,'test-admin')",
      [
        setting.scope,
        setting.cap,
        setting.baseAnte,
        setting.cutoverDate,
        setting.groupSlugs,
      ]
    )
  )
}

const league: MajorSettingRow = {
  scope: 'mlb',
  cap: 500,
  baseAnte: 100,
  cutoverDate: '2026-03-01',
  groupSlugs: ['sports', 'baseball'],
}
const shared = (scope: string, cap: number): MajorSettingRow => ({
  scope,
  cap,
  baseAnte: null,
  cutoverDate: null,
  groupSlugs: null,
})
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role;
`)
  const migration = ddl(
    'migrations/2026112102_sports_bdl_creation_settings.sql'
  )
  await db.exec(migration)
  await db.exec(migration)
})
beforeEach(async () => {
  await db.exec('truncate sports_bdl_creation_settings')
})
afterAll(async () => db.close())

it('keeps missing settings disabled and reads only the selected league, wave and global caps', async () => {
  expect(await getMajorSettings(pg, 'mlb')).toBeNull()
  for (const row of [
    league,
    shared('wave:1', 11),
    shared('wave:3', 3000),
    { ...league, scope: 'nfl', cap: 800 },
  ])
    await seed(row)
  expect(await getMajorSettings(pg, 'mlb')).toBeNull()
  await seed(shared('global', 9000))
  const initial = await getMajorSettings(pg, 'mlb')
  expect(initial).toMatchObject({
    league: 'mlb',
    baseAnte: 100,
    cutoverDate: '2026-03-01',
    groupSlugs: ['sports', 'baseball'],
    limits: {
      perLeagueDailyAnte: 500,
      perWaveAnte: 3000,
      globalOpenAnte: 9000,
    },
  })
  expect([...(initial?.waveLeagueKeys ?? [])].sort()).toEqual([
    'mlb',
    'nfl',
    'wnba',
  ])
  expect(await getMajorSettings(pg, 'nhl')).toBeNull()
  expect(await creationSettings(pg, [])).toEqual([])
  expect(await creationSettings(pg, ['wave:1', 'mlb'])).toEqual([
    league,
    shared('wave:1', 11),
  ])
  await db.exec(
    "update sports_bdl_creation_settings set ante_cap=0 where scope='mlb'"
  )
  expect((await getMajorSettings(pg, 'mlb'))?.limits.perLeagueDailyAnte).toBe(0)
  expect((await getMajorSettings(pg, 'nfl'))?.limits.perLeagueDailyAnte).toBe(
    800
  )
})
const invalid: [string, MajorSettingRow][] = [
  ['unsupported scope', { ...league, scope: 'other' }],
  ['negative league cap', { ...league, cap: -1 }],
  ['negative global cap', shared('global', -1)],
  ['zero ante', { ...league, baseAnte: 0 }],
  ['missing ante', { ...league, baseAnte: null }],
  ['missing cutover', { ...league, cutoverDate: null }],
  ['infinite cutover', { ...league, cutoverDate: 'infinity' }],
  ['missing groups', { ...league, groupSlugs: null }],
  ['empty groups', { ...league, groupSlugs: [] }],
  [
    'nine groups',
    { ...league, groupSlugs: Array.from({ length: 9 }, (_, i) => 'g' + i) },
  ],
  [
    'null group element',
    { ...league, groupSlugs: [null] as unknown as string[] },
  ],
  ['invalid group character', { ...league, groupSlugs: ['bad group'] }],
  ['compound group entry', { ...league, groupSlugs: ['sports,baseball'] }],
  [
    'nested groups',
    { ...league, groupSlugs: [['baseball']] as unknown as string[] },
  ],
  ['wave with ante', { ...shared('wave:1', 1), baseAnte: 10 }],
  ['wave with date', { ...shared('wave:2', 1), cutoverDate: '2026-01-01' }],
  ['global with groups', { ...shared('global', 1), groupSlugs: ['sports'] }],
]
it.each(invalid)('rejects invalid setting: %s', async (_name, setting) => {
  await expect(seed(setting)).rejects.toThrow()
  expect(await creationSettings(pg)).toEqual([])
})
it('restricts settings to the service role despite permissive Supabase default grants', async () => {
  const table = 'public.sports_bdl_creation_settings'
  expect(
    (
      await db.query(
        'select relrowsecurity as rls from pg_class where oid=$1::regclass',
        [table]
      )
    ).rows
  ).toEqual([{ rls: true }])
  expect(
    (
      await db.query(
        "select policyname from pg_policies where tablename='sports_bdl_creation_settings'"
      )
    ).rows
  ).toEqual([])
  for (const role of ['anon', 'authenticated', 'service_role'])
    for (const permission of [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      const allowed =
        role === 'service_role' &&
        ['SELECT', 'INSERT', 'UPDATE'].includes(permission)
      expect(
        (
          await db.query('select has_table_privilege($1,$2,$3) as allowed', [
            role,
            table,
            permission,
          ])
        ).rows
      ).toEqual([{ allowed }])
    }
  await db.exec('set role service_role')
  try {
    await seed(shared('global', 99))
    expect(await creationSettings(pg)).toEqual([shared('global', 99)])
  } finally {
    await db.exec('reset role')
  }
})

it('defers incomplete backfilled settings and attaches all independent caps only to their own scopes', async () => {
  for (const rows of [
    [league, shared('global', 1000)],
    [
      { ...league, baseAnte: null },
      shared('wave:3', 2000),
      shared('global', 1000),
    ],
    [
      { ...league, cutoverDate: null },
      shared('wave:3', 2000),
      shared('global', 1000),
    ],
    [
      { ...league, groupSlugs: [] },
      shared('wave:3', 2000),
      shared('global', 1000),
    ],
  ]) {
    const old = { manyOrNone: async () => rows } as unknown as Pick<
      SupabaseDirectClient,
      'manyOrNone'
    >
    expect(await getMajorSettings(old, 'mlb')).toBeNull()
  }
})

it('requires an audit user, timestamp, and cap and rejects an unknown shared-budget scope', async () => {
  await expect(
    db.query(
      "insert into sports_bdl_creation_settings (scope,ante_cap) values('global',1)"
    )
  ).rejects.toThrow()
  await expect(
    db.query(
      "insert into sports_bdl_creation_settings (scope,ante_cap,updated_by,updated_at) values('global',1,'admin',null)"
    )
  ).rejects.toThrow()
  await expect(
    db.query(
      "insert into sports_bdl_creation_settings (scope,updated_by) values('global','admin')"
    )
  ).rejects.toThrow()
  await expect(seed(shared('wave:4', 55))).rejects.toThrow()
  expect(await creationSettings(pg)).toEqual([])
})
