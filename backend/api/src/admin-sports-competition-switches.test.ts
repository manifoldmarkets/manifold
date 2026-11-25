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
) => Promise<{ switches: { phase: string }[] }>
const auth = { uid: 'admin' }
const legacy = {
  competitionId: 'nba-regular-2026-27',
  phase: 'Regular Season',
  on: true,
}
const bdl = { ...legacy, phase: 'Regular Season (BDL)' }
const tx = { one: jest.fn() }
const db = {
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
