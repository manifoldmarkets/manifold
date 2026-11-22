import type { CompetitionSwitchState } from 'common/sports-calendar'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getCompetitionSwitchRows,
  getCompetitionSwitches,
  setCompetitionSwitch,
} from 'shared/supabase/sports-competition-switches'
import {
  adminSportsCompetitionSwitches,
  adminSportsSetCompetitionSwitch,
} from './admin-sports-competition-switches'

jest.mock('shared/helpers/auth', () => ({ throwErrorIfNotAdmin: jest.fn() }))
jest.mock('shared/utils', () => ({ log: jest.fn() }))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/sports-competition-switches', () => ({
  getCompetitionSwitchRows: jest.fn(),
  getCompetitionSwitches: jest.fn(),
  setCompetitionSwitch: jest.fn(),
}))

type Change = { competitionId: string; phase: string; on: boolean }
const set = adminSportsSetCompetitionSwitch as unknown as (
  c: Change,
  a: { uid: string }
) => Promise<unknown>
const get = adminSportsCompetitionSwitches as unknown as (
  c: Record<string, never>,
  a: { uid: string }
) => Promise<{ switches: CompetitionSwitchState[] }>
const auth = { uid: 'admin' }
const legacy = {
  competitionId: 'nba-regular-2026-27',
  phase: 'Regular Season',
  on: true,
}
const bdl = { ...legacy, phase: 'Regular Season (BDL)' }
const tx = { one: jest.fn() }
const db = {
  map: jest.fn().mockResolvedValue([['admin', 'operator']]),
  tx: jest.fn(async (fn: (conn: typeof tx) => Promise<void>) => fn(tx)),
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...process.env }
  delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      db as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getCompetitionSwitchRows).mockResolvedValue([])
  jest.mocked(getCompetitionSwitches).mockResolvedValue({})
})
const originalEnv = process.env
afterEach(() => {
  process.env = originalEnv
})
it('exposes legacy phases and applies a legacy switch with no new lock or budget read when off', async () => {
  expect(
    (await get({}, auth)).switches.some((s) => s.phase.includes('(BDL)'))
  ).toBe(false)
  jest.mocked(createSupabaseDirectClient).mockClear()
  await expect(set(bdl, auth)).rejects.toMatchObject({ code: 400 })
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  await expect(set(legacy, auth)).resolves.toEqual({ on: true })
  expect(setCompetitionSwitch).toHaveBeenCalledTimes(1)
  expect(setCompetitionSwitch).toHaveBeenCalledWith(db, {
    ...legacy,
    userId: auth.uid,
  })
  expect(db.tx).not.toHaveBeenCalled()
  expect(getCompetitionSwitches).not.toHaveBeenCalled()
})
it('serializes a switch change and rechecks conflicting providers after opt-in', async () => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  jest
    .mocked(getCompetitionSwitches)
    .mockResolvedValue({ [legacy.competitionId + ':' + legacy.phase]: true })
  await expect(set(bdl, auth)).rejects.toMatchObject({ code: 400 })
  expect(tx.one).toHaveBeenCalledTimes(1)
  expect(tx.one).toHaveBeenCalledWith(
    "select pg_advisory_xact_lock(hashtext('sports-creation-budget'))"
  )
  expect(setCompetitionSwitch).not.toHaveBeenCalled()
})

it.each([legacy, bdl])(
  'shows both configured switches and allows disabling either conflicting phase: $phase',
  async (disable) => {
    const saved = new Map<string, boolean>()
    const people = jest.mocked(getCompetitionSwitchRows)
    people.mockImplementation(async () =>
      Array.from(saved, ([phase, on]) => ({
        competitionId: legacy.competitionId,
        phase,
        on,
        updatedBy: auth.uid,
        updatedTime: 1000,
      }))
    )
    jest
      .mocked(getCompetitionSwitches)
      .mockImplementation(async () =>
        Object.fromEntries(
          Array.from(saved, ([phase, on]) => [
            legacy.competitionId + ':' + phase,
            on,
          ])
        )
      )
    jest.mocked(setCompetitionSwitch).mockImplementation(async (_, change) => {
      saved.set(change.phase, change.on)
    })
    const pair = async () =>
      (await get({}, auth)).switches.filter(
        (row) => row.competitionId === legacy.competitionId
      )
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
    await set(bdl, auth)
    await expect(set(legacy, auth)).rejects.toMatchObject({ code: 400 })
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'false'
    await set(legacy, auth)
    expect((await pair()).map((r) => r.phase)).toEqual([legacy.phase])
    expect((await pair())[0]).not.toHaveProperty('creationConflicts')
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
    const both = await pair()
    expect(both).toHaveLength(2)
    for (const row of both) {
      expect(row.on).toBe(true)
      const other = both.find((r) => r.phase !== row.phase)!
      expect(row.creationConflicts).toContain(
        `${other.competition} / ${other.phase}`
      )
    }
    expect(setCompetitionSwitch).toHaveBeenCalledTimes(2)
    await set({ ...disable, on: false }, auth)
    const cleared = await pair()
    expect(cleared.map((r) => r.on)).toEqual(
      cleared.map((r) => r.phase !== disable.phase)
    )
    expect(cleared.every((r) => !r.creationConflicts)).toBe(true)
  }
)
