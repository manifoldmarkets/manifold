import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import type { F1Session } from 'common/f1-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { HOUR_MS } from 'common/util/time'
import type { SupabaseDirectClient } from '../supabase/init'
import {
  beginF1Observation,
  finishF1Observation,
} from './f1-session-observation'

jest.setTimeout(60000)
const pgp = pgPromise()
let db: PGlite
const query = async (s: string, a: unknown[]) =>
  (await db.query(pgp.as.format(s, a))).rows
const pg = { none: query, manyOrNone: query } as unknown as SupabaseDirectClient
const owner = MANIFOLD_SPORTS_USER_IDS[0]
const at = Date.UTC(2026, 10, 20, 12)
const session = (
  id: number,
  status_state: F1Session['status_state']
): F1Session => ({
  id,
  event: { id: 374, name: 'GP', short_name: 'GP', season: 2026 },
  name: 'Race',
  type: 'Race',
  date: new Date(at).toISOString(),
  status_state,
})
const begin = () => beginF1Observation(pg, [374])
const finish = (receipt: string, list: F1Session[], when = at) =>
  finishF1Observation(pg, receipt, [374], list, when)
const inspect = async (id: string) =>
  (
    await db.query<{ data: Record<string, unknown> }>(
      'select data from contracts where id=$1',
      [id]
    )
  ).rows[0].data
const add = async (
  id: string,
  event: string,
  more: Record<string, unknown> = {},
  creator = owner
) =>
  db.query(
    "insert into contracts values($1,$2,'public',false,'MANA',null,$3::jsonb)",
    [id, creator, JSON.stringify({ sportsEventId: event, ...more })]
  )
beforeAll(async () => {
  db = new PGlite()
  await db.exec(
    'create table contracts(id text primary key,creator_id text,visibility text,deleted boolean,token text,resolution text,data jsonb not null)'
  )
})
beforeEach(async () => {
  await db.exec('truncate contracts')
})
afterAll(async () => {
  await db.close()
  pgp.end()
})

test('a prior canceled response cannot restore a missing session, including an unmarked off-page sibling', async () => {
  await add('winner', 'bdl-f1:374:20', {
    sportsCanceledSince: at - 3 * HOUR_MS,
  })
  await add('podium', 'bdl-f1:374:20')
  await add('qualifying', 'bdl-f1:374:21', {
    sportsFinalSince: at - 3 * HOUR_MS,
  })
  await add('other-event', 'bdl-f1:375:20', { sportsCanceledSince: 7 })
  await add('community', 'bdl-f1:374:20', { sportsCanceledSince: 8 }, 'other')
  const stale = await begin(),
    fresh = await begin()
  await finish(fresh, [session(21, 'final')])
  expect((await finish(stale, [session(20, 'canceled')])).size).toBe(0)
  for (const id of ['winner', 'podium'])
    expect(await inspect(id)).toEqual({
      sportsEventId: 'bdl-f1:374:20',
      sportsF1ScheduleReceipt: fresh,
    })
  expect((await inspect('qualifying')).sportsFinalSince).toBe(at)
  expect((await inspect('other-event')).sportsCanceledSince).toBe(7)
  expect((await inspect('community')).sportsCanceledSince).toBe(8)
  const sequential = await begin()
  const marks = await finish(
    sequential,
    [session(20, 'canceled'), session(21, 'final')],
    at + 1
  )
  expect(marks.get('winner')?.canceledSince).toBe(at + 1)
  expect(marks.get('qualifying')?.finalSince).toBe(at)
})

test('after a failed reset a new sync and resolver need two hours from the next valid receipt', async () => {
  await add('m', 'bdl-f1:374:20', { sportsCanceledSince: at - 3 * HOUR_MS })
  const failed = await begin()
  const unavailable = {
    manyOrNone: async () => {
      throw Error('fixture write unavailable')
    },
  } as unknown as SupabaseDirectClient
  await expect(
    finishF1Observation(unavailable, failed, [374], [], at)
  ).rejects.toThrow()
  expect((await inspect('m')).sportsF1SchedulePending).toBe(failed)
  const stamp = at + 110 * 60000
  for (const t of [
    stamp,
    stamp + 1,
    stamp + 2 * HOUR_MS - 1,
    stamp + 2 * HOUR_MS,
  ]) {
    const marks = await finish(await begin(), [session(20, 'canceled')], t)
    expect(marks.get('m')?.canceledSince).toBe(stamp)
    expect(t - marks.get('m')!.canceledSince! >= 2 * HOUR_MS).toBe(
      t === stamp + 2 * HOUR_MS
    )
  }
})

test('a missing, null, malformed or future legacy clock starts at receipt while a valid past mark survives', async () => {
  const invalid = [null, 0, -2, '2', 1.5, at + 1, {}, false]
  for (const [i, stamp] of invalid.entries())
    await add(String(i), 'bdl-f1:374:20', { sportsFinalSince: stamp })
  await add('absent', 'bdl-f1:374:20')
  await add('valid', 'bdl-f1:374:20', { sportsFinalSince: at - 100 })
  const marks = await finish(await begin(), [session(20, 'final')])
  for (const id of [...invalid.keys()].map(String).concat('absent'))
    expect(marks.get(id)?.finalSince).toBe(at)
  expect(marks.get('valid')?.finalSince).toBe(at - 100)
})
