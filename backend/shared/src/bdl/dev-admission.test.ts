import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { performance } from 'perf_hooks'
import {
  BDL_DEV_LEAGUE_REQUESTS_PER_MINUTE,
  BDL_REQUESTS_PER_MINUTE,
} from 'common/bdl/constants'
import {
  BDL_ADDITIONAL_SPORTS,
  SPORT_LEAGUE_LABEL,
} from 'common/sports-calendar'
import { sportForLeague } from 'common/sports-score-polling'
import { createSupabaseDirectClient } from '../supabase/init'
import { reserveDevBdlSlot, sendDevBdlRequest } from './dev-admission'

jest.mock('../supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.setTimeout(30_000)
let db: PGlite
type TestDatabase = ReturnType<typeof createSupabaseDirectClient>
let pg: TestDatabase
beforeAll(async () => {
  db = new PGlite()
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls'
  )
  await db.exec(
    readFileSync(
      resolve(__dirname, '../../../supabase/sports_bdl_dev_request_slots.sql'),
      'utf8'
    )
  )
  type Tx = {
    one: (sql: string, params?: unknown[]) => Promise<unknown>
    none: (sql: string, params?: unknown[]) => Promise<void>
  }
  pg = {
    tx: <T>(fn: (tx: Tx) => Promise<T>) =>
      db.transaction(async (tx) =>
        fn({
          one: async (sql, params) => (await tx.query(sql, params)).rows[0],
          none: async (sql, params) => {
            await tx.query(sql, params)
          },
        })
      ),
  } as unknown as TestDatabase
  jest.mocked(createSupabaseDirectClient).mockReturnValue(pg)
})
beforeEach(async () => {
  await db.exec('truncate sports_bdl_dev_request_slots')
})
afterAll(async () => db.close())

it('serializes dev API and scheduler admissions against the same total and league balances', async () => {
  expect(BDL_REQUESTS_PER_MINUTE.dev).toBe(2)
  expect(BDL_DEV_LEAGUE_REQUESTS_PER_MINUTE).toBe(2)
  const [first, second, third] = await Promise.all([
    reserveDevBdlSlot(pg, 'nba'),
    reserveDevBdlSlot(pg, 'nba'),
    reserveDevBdlSlot(pg, 'nhl'),
  ])
  expect([first, second, third].filter((delay) => delay === 0)).toHaveLength(1)
  expect(Math.max(first, second, third)).toBeGreaterThan(30_000)
  expect(Math.max(first, second, third)).toBeLessThanOrEqual(32_001)
  await db.exec(
    "update sports_bdl_dev_request_slots set next_request_at=clock_timestamp()-interval '1 second' where scope='global'"
  )
  const admitted = third === 0 ? 'nhl' : 'nba'
  expect(await reserveDevBdlSlot(pg, admitted)).toBeGreaterThan(0)
  expect(await reserveDevBdlSlot(pg, admitted === 'nhl' ? 'nba' : 'nhl')).toBe(
    0
  )
})

it('raises on a failed coordination read, sends nothing and never uses the local rate as fallback', async () => {
  jest.mocked(createSupabaseDirectClient).mockReturnValueOnce({
    tx: async () => {
      throw Error('local admission unavailable')
    },
  } as unknown as TestDatabase)
  const send = jest.fn()
  await expect(
    sendDevBdlRequest('nba', async () => true, send)
  ).rejects.toThrow('local admission unavailable')
  expect(send).not.toHaveBeenCalled()
})

it('discards a delayed grant and a league disabled during admission', async () => {
  let time = performance.now()
  const start = jest.spyOn(performance, 'now').mockImplementation(() => time)
  const send = jest.fn()
  let calls = 0
  const enabled = async () => {
    if (++calls === 2) time += 4000
    return calls <= 2
  }
  try {
    await expect(sendDevBdlRequest('nba', enabled, send)).rejects.toThrow(
      'League disabled'
    )
    expect(send).not.toHaveBeenCalled()
    await db.exec('truncate sports_bdl_dev_request_slots')
    calls = 0
    await expect(
      sendDevBdlRequest('nba', async () => ++calls === 1, send)
    ).rejects.toThrow('League disabled')
    expect(send).not.toHaveBeenCalled()
  } finally {
    start.mockRestore()
  }
})

it('preserves untyped legacy Odds league classification for the new BDL sports', () => {
  expect(sportForLeague('NBA')).toBe('nba')
  for (const key of Object.keys(
    BDL_ADDITIONAL_SPORTS
  ) as (keyof typeof BDL_ADDITIONAL_SPORTS)[])
    expect(sportForLeague(SPORT_LEAGUE_LABEL[key])).toBeUndefined()
})
