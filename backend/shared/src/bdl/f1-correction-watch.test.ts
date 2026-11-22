import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import type { F1Session, F1SessionResult } from 'common/f1-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { getF1Sessions, getF1SessionResults } from '../balldontlie-f1-client'
import { sendTextEmail } from '../send-email'
import type { SupabaseDirectClient } from '../supabase/init'
import { getSportsAttention } from './attention-queries'
import { f1ClassificationHash, f1WatchSeed } from './f1-classification'
import { f1WatchDue, runF1CorrectionWatch } from './f1-correction-watch'

jest.mock('../balldontlie-f1-client', () => ({
  getF1Sessions: jest.fn(),
  getF1SessionResults: jest.fn(),
}))
jest.mock('../utils', () => ({
  isProd: () => true,
  log: { warn: jest.fn(), error: jest.fn() },
}))
jest.mock('../send-email', () => ({
  sendTextEmail: jest.fn().mockResolvedValue(true),
}))
jest.mock('../supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.setTimeout(60_000)
const pgp = pgPromise()
let db: PGlite
const query = async (sql: string, args: unknown[]) =>
  (await db.query(pgp.as.format(sql, args))).rows
const pg = {
  manyOrNone: query,
  oneOrNone: async (s: string, a: unknown[]) => (await query(s, a))[0] ?? null,
  map: async (s: string, a: unknown[], f: (row: unknown) => unknown) =>
    (await query(s, a)).map(f),
} as unknown as SupabaseDirectClient
const resolved = Date.parse('2026-11-22T08:00:00Z')
let now = resolved + HOUR_MS
const clock = () => now
const event = 'bdl-f1:374:1870'
const session: F1Session = {
  id: 1870,
  event: { id: 374, name: 'Example GP', short_name: 'Example', season: 2026 },
  name: 'Race',
  type: 'Race',
  date: '2026-11-21T14:30:00Z',
  status_state: 'final',
}
const rows = (drivers: number[]): F1SessionResult[] =>
  drivers.map((id, i) => ({
    id,
    session: { id: 1870 },
    driver: {
      id,
      first_name: 'A',
      last_name: 'B',
      display_name: 'Racer',
      short_name: 'A. B',
      country_code: null,
      racing_number: null,
    },
    position: i + 1,
    is_winner: i === 0,
    retired: false,
    laps_completed: 60,
  }))
const original = rows([1, 2, 3, 4]),
  changed = rows([1, 2, 4, 3])
const hash = (r: F1SessionResult[]) => f1ClassificationHash(1870, r)!
const stored = () => ({
  ...f1WatchSeed(event, session, original)!,
  observedHash: hash(original),
  resolutionTime: resolved,
  checkedTime: resolved,
})
const source = {
  sportsEventId: event,
  sportsMarketType: 'winner',
  sportsLeague: 'Formula 1',
  creatorUsername: 'ManifoldSports',
}
async function insert(
  id: string,
  data: Record<string, unknown> = {},
  owner = MANIFOLD_SPORTS_USER_IDS[0]
) {
  await db.query(
    `insert into contracts (id,data,creator_id,visibility,token,outcome_type,resolution,resolution_time,close_time,slug,question) values ($1,$2,$3,'public','MANA','MULTIPLE_CHOICE','answer-1',$4,$4,$1,$1)`,
    [
      id,
      JSON.stringify({ ...source, sportsF1Watch: stored(), ...data }),
      owner,
      new Date(resolved).toISOString(),
    ]
  )
}
const get = async (id: string) =>
  (
    await db.query<{ resolution: string; data: Record<string, unknown> }>(
      'select resolution,data from contracts where id=$1',
      [id]
    )
  ).rows[0]
const old = process.env
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create table contracts(id text primary key,data jsonb not null,creator_id text,visibility text,token text,outcome_type text,resolution text,resolution_time timestamptz,close_time timestamptz,deleted boolean,slug text,question text);
create table sports_competition_switches(competition_id text,phase text,enabled boolean,updated_by text,updated_time timestamptz)`)
})
beforeEach(async () => {
  process.env = {
    ...old,
    NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true',
    SPORTS_BDL_F1_SHARED_CLIENT: 'true',
    SPORTS_BDL_F1_CORRECTION_WATCH: 'true',
  }
  await db.exec(
    `truncate contracts,sports_competition_switches; insert into sports_competition_switches values ('f1-2026','2026 Remaining',true,'fixture',now())`
  )
  jest.clearAllMocks()
  now = resolved + HOUR_MS
  jest.mocked(getF1Sessions).mockResolvedValue([session])
  jest.mocked(getF1SessionResults).mockResolvedValue(original)
})
afterEach(() => {
  process.env = old
})
afterAll(async () => {
  await db.close()
})
test('hash ignores row order and driver display metadata, detects changes below the podium and refuses invalid pages', () => {
  expect(
    hash(
      [...original].reverse().map((x) => ({
        ...x,
        driver: { ...x.driver, display_name: 'Changed' },
      }))
    )
  ).toBe(hash(original))
  expect(hash(changed)).not.toBe(hash(original))
  for (const invalid of [
    [],
    [...original, original[0]],
    original.map((r) => ({ ...r, session: { id: 2 } })),
    original.map((r) => ({ ...r, position: 1 })),
    original.map((r) => ({ ...r, is_winner: true })),
    original.map((r) => ({ ...r, laps_completed: -1 })),
  ])
    expect(f1ClassificationHash(1870, invalid)).toBeUndefined()
})
test('daily cadence decays through hour, six-hour and daily checks with exact expiry', () => {
  const w = stored()
  for (const [age, interval] of [
    [2 * HOUR_MS, HOUR_MS],
    [DAY_MS, 6 * HOUR_MS],
    [3 * DAY_MS, DAY_MS],
  ]) {
    const at = resolved + age
    expect(f1WatchDue({ ...w, checkedTime: at - interval }, at)).toBe(true)
    expect(f1WatchDue({ ...w, checkedTime: at - interval + 1 }, at)).toBe(false)
  }
  expect(f1WatchDue(w, resolved + 14 * DAY_MS)).toBe(false)
  expect(f1WatchDue(w, resolved - 1)).toBe(false)
})
test('disabled gates and disabled matching phase do no provider work', async () => {
  for (const gate of [
    'NEXT_PUBLIC_SPORTS_BDL_ENABLED',
    'SPORTS_BDL_F1_SHARED_CLIENT',
    'SPORTS_BDL_F1_CORRECTION_WATCH',
  ]) {
    process.env[gate] = 'false'
    expect(
      (await runF1CorrectionWatch({} as SupabaseDirectClient, clock)).checked
    ).toBe(0)
    process.env[gate] = 'true'
  }
  await insert('race')
  await db.exec(
    `update sports_competition_switches set enabled=false;insert into sports_competition_switches values ('f1-2027','2027 Season',true,'x',now())`
  )
  expect((await runF1CorrectionWatch(pg, clock)).checked).toBe(0)
  expect(getF1Sessions).not.toHaveBeenCalled()
})
test('parallel workers claim a changed classification once per market; later corrections retain the original payout and one email', async () => {
  await insert('winner')
  await insert('podium', { sportsMarketType: 'podium' })
  jest.mocked(getF1SessionResults).mockResolvedValue(changed)
  const first = await Promise.all([
    runF1CorrectionWatch(pg, clock),
    runF1CorrectionWatch(pg, clock),
  ])
  expect(first.reduce((s, r) => s + r.corrections, 0)).toBe(2)
  expect(sendTextEmail).toHaveBeenCalledTimes(2)
  expect(
    (await getSportsAttention(pg, {}, now)).items.map((i) => i.id)
  ).toEqual(['podium', 'winner'])
  expect((await get('winner')).resolution).toBe('answer-1')
  expect((await get('winner')).data.sportsF1Watch).toMatchObject({
    baseline: hash(original),
    observedHash: hash(changed),
    correctedTime: now,
  })
  const reads = jest.mocked(getF1SessionResults).mock.calls.length
  expect((await runF1CorrectionWatch(pg, clock)).checked).toBe(0)
  expect(getF1SessionResults).toHaveBeenCalledTimes(reads)
  now += HOUR_MS
  expect((await runF1CorrectionWatch(pg, clock)).corrections).toBe(0)
  now += HOUR_MS
  jest.mocked(getF1SessionResults).mockResolvedValue(original)
  expect((await runF1CorrectionWatch(pg, clock)).corrections).toBe(2)
  expect(sendTextEmail).toHaveBeenCalledTimes(2)
  expect((await get('winner')).resolution).toBe('answer-1')
})
test('gaps, mismatched sessions and invalid classifications do not invent a correction', async () => {
  await insert('race')
  for (const sessions of [
    [],
    [{ ...session, event: { ...session.event, id: 2 } }],
    [session, session],
    [{ ...session, status_state: 'scheduled' as const }],
    [session],
  ]) {
    jest.mocked(getF1Sessions).mockResolvedValue(sessions)
    jest.mocked(getF1SessionResults).mockResolvedValue([])
    expect(await runF1CorrectionWatch(pg, clock)).toEqual({
      checked: 1,
      unavailable: 1,
      corrections: 0,
    })
    now += HOUR_MS
  }
  expect((await get('race')).data.sportsF1Watch).toMatchObject({
    baseline: hash(original),
    observedHash: hash(original),
  })
  jest.mocked(getF1Sessions).mockResolvedValue([session])
  jest.mocked(getF1SessionResults).mockResolvedValue(original.slice(0, 1))
  expect(await runF1CorrectionWatch(pg, clock)).toEqual({
    checked: 1,
    unavailable: 1,
    corrections: 0,
  })
  expect((await get('race')).data.sportsAttentionReason).toBeUndefined()
})
test('ignores historic missing baselines, fixtures, canceled and re-settled markets, unrelated providers, private and community rows', async () => {
  await insert('nohash', { sportsF1Watch: null })
  await insert('fixture', { sportsFixture: true })
  await insert('season', { sportsEventId: 'bdl-f1-title:2026:drivers' })
  await insert('reissued', { sportsEventId: 'bdl-f1:375:1870' })
  await insert('provider', { sportsProvider: 'odds' })
  await insert('league', { sportsLeagueKey: 'nba' })
  await insert('community', {}, 'someone')
  for (const [id, sql] of [
    ['canceled', "resolution='CANCEL'"],
    ['unresolved', 'resolution=null'],
    ['resettled', "resolution_time=resolution_time+interval '1 second'"],
    ['cash', "token='CASH'"],
    ['private', "visibility='private'"],
    ['deleted', 'deleted=true'],
  ]) {
    await insert(id)
    await db.exec(`update contracts set ${sql} where id='${id}'`)
  }
  await runF1CorrectionWatch(pg, clock)
  expect(getF1Sessions).not.toHaveBeenCalled()
})
test('a disabled phase, expired watch or changed settlement during provider I/O prevents the incident write', async () => {
  for (const scenario of ['off', 'expired', 'resettled']) {
    await db.exec(
      'truncate contracts;update sports_competition_switches set enabled=true'
    )
    now = resolved + HOUR_MS
    await insert('race')
    jest.mocked(getF1SessionResults).mockImplementationOnce(async () => {
      if (scenario === 'off')
        await db.exec('update sports_competition_switches set enabled=false')
      if (scenario === 'expired') now = resolved + 14 * DAY_MS
      if (scenario === 'resettled')
        await db.exec(
          "update contracts set resolution_time=resolution_time+interval '1 minute'"
        )
      return changed
    })
    expect((await runF1CorrectionWatch(pg, clock)).corrections).toBe(0)
    expect((await get('race')).data.sportsF1Watch).toEqual(stored())
  }
  expect(sendTextEmail).not.toHaveBeenCalled()
})
