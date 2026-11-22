import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import type { SupabaseDirectClient } from '../supabase/init'
import { log } from '../utils'
import { calendarPhaseKey, getSportsCalendar } from 'common/sports-calendar'
import { calendarSamples, recordSportsHealth } from './sports-health'

jest.mock('../utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))

const phase = getSportsCalendar().find((e) => e.provider === 'bdl-f1')!
const end = '2027-12-12'
const boundary = Date.parse('2027-11-12T23:59:59Z')
const switches = { [calendarPhaseKey(phase)]: true }
it('checks the final maintained phase of an enabled league at the inclusive 30-day boundary', () => {
  const later = {
    ...phase,
    competitionId: 'f1-next',
    endDate: end,
    autoCreate: false,
  }
  const phases = [phase, later]
  expect(calendarSamples(phases, switches, boundary - 1)).toMatchObject([
    { league: 'f1', end, bad: false },
  ])
  expect(calendarSamples(phases, switches, boundary)).toMatchObject([
    { league: 'f1', end, bad: true },
  ])
  expect(
    calendarSamples(phases, switches, boundary + 31 * 86400000)[0].bad
  ).toBe(true)
  expect(calendarSamples(phases, {}, boundary)).toEqual([])
  expect(
    calendarSamples([{ ...phase, locked: 'manual' }], switches, boundary)
  ).toEqual([])
  expect(
    calendarSamples(
      [...phases, { ...later, endDate: '2028-12-01' }],
      switches,
      boundary
    )[0].bad
  ).toBe(false)
})
it('does no database work and needs no key when rollout is disabled', async () => {
  const old = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  try {
    delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    const pg = { tx: jest.fn() } as unknown as Parameters<
      typeof recordSportsHealth
    >[0]
    await recordSportsHealth(pg, [], true)
    await recordSportsHealth(pg, [
      {
        competitionId: 'f1-2026',
        sessionId: 123,
        empty: true,
        startedAt: 1,
        observedAt: 1,
      },
    ])
    expect(pg.tx).not.toHaveBeenCalled()
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = old
  }
})

it('opens on a second confirmed empty after two hours, deduplicates, recovers and retires disabled or stale observations', async () => {
  const db = new PGlite()
  const pgp = pgPromise()
  const previous = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  const clock = jest.spyOn(Date, 'now')
  const HOUR = 3600000,
    t = Date.parse('2026-11-21T12:00:00Z')
  const ddl = (file: string) =>
    readFileSync(resolve(__dirname, '../../../supabase', file), 'utf8')
  try {
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;create table users(id text primary key);insert into users values ('admin')"
    )
    await db.exec(ddl('sports_competition_switches.sql'))
    await db.exec(ddl('migrations/2026112302_sports_provider_incidents.sql'))
    await db.query(
      "insert into sports_competition_switches(competition_id,phase,enabled,updated_by) values ($1,$2,true,'admin')",
      [phase.competitionId, phase.phase]
    )
    const pg = {
      tx: <T>(fn: (pg: SupabaseDirectClient) => Promise<T>) =>
        db.transaction(async (tx) => {
          const rows = async (sql: string, params?: unknown[]) =>
            (
              await tx.query<Record<string, unknown>>(
                pgp.as.format(sql, params)
              )
            ).rows
          return fn({
            one: async (sql: string) => (await rows(sql))[0],
            oneOrNone: async (sql: string, params: unknown[]) =>
              (await rows(sql, params))[0] ?? null,
            none: rows,
            map: async (
              sql: string,
              p: unknown[],
              f: (row: Record<string, unknown>) => unknown
            ) => (await rows(sql, p)).map(f),
          } as unknown as SupabaseDirectClient)
        }),
    } as unknown as SupabaseDirectClient
    const poll = async (
      start: number,
      at: number,
      empty: boolean,
      scope = phase.competitionId
    ) => {
      clock.mockReturnValue(at)
      return recordSportsHealth(pg, [
        {
          competitionId: scope,
          sessionId: 850,
          startedAt: start,
          observedAt: at,
          empty,
        },
      ])
    }
    const state = async () =>
      (
        await db.query<{ open: boolean; pending: boolean }>(
          "select opened_at is not null as open,first_seen_at is not null as pending from sports_provider_incidents where subject='850'"
        )
      ).rows
    await poll(t, t, true, 'f1-2027')
    expect(await state()).toEqual([])
    await poll(t, t, true)
    await poll(t + 2 * HOUR - 1, t + 2 * HOUR - 1, true)
    expect(await state()).toEqual([{ open: false, pending: true }])
    await poll(t + 2 * HOUR, t + 2 * HOUR, true)
    await poll(t + 2 * HOUR + 1, t + 2 * HOUR + 1, true)
    expect(await state()).toEqual([{ open: true, pending: true }])
    expect(log.error).toHaveBeenCalledTimes(1)
    await poll(t + 1, t + 2, false)
    expect(await state()).toEqual([{ open: true, pending: true }])
    await poll(t + 1, t + 2 * HOUR + 2, false) // The earlier request returned late.
    expect(await state()).toEqual([{ open: true, pending: true }])
    await poll(t + 3 * HOUR, t + 3 * HOUR, false)
    await poll(t + HOUR, t + 4 * HOUR, true) // Old request arriving after recovery.
    expect(await state()).toEqual([{ open: false, pending: false }])
    expect(log).toHaveBeenCalledTimes(1)
    await poll(t + 5 * HOUR, t + 5 * HOUR, true)
    expect(await state()).toEqual([{ open: false, pending: true }])
    clock.mockReturnValue(t + 31 * 24 * HOUR)
    await recordSportsHealth(pg, [], true)
    expect(await state()).toEqual([])
    await poll(t + 32 * 24 * HOUR, t + 32 * 24 * HOUR, true)
    await db.exec('update sports_competition_switches set enabled=false')
    await recordSportsHealth(pg, [], true)
    expect(await state()).toEqual([])
  } finally {
    clock.mockRestore()
    if (previous === undefined)
      delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = previous
    await db.close()
  }
}, 60000)
