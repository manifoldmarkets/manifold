jest.mock('common/bdl/rollout', () => ({
  isSportsBdlEnabled: jest.fn(() => true),
}))
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { createSupabaseDirectClient } from 'shared/supabase/init'
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => 'pg'),
}))
jest.mock('shared/bdl/major-settings', () => ({
  creationSettings: jest.fn(),
  saveCreationSetting: jest.fn(),
}))
jest.mock('shared/bdl/create-major-markets', () => ({
  runMajorCreation: jest.fn(),
}))
jest.mock('shared/utils', () => ({ isProd: () => true }))
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isAdminId: (id: string) => id === 'admin',
}))

import { API } from 'common/api/schema'
import { runMajorCreation } from 'shared/bdl/create-major-markets'
import {
  creationSettings,
  saveCreationSetting,
} from 'shared/bdl/major-settings'
import {
  adminSportsCreationSettings,
  adminCreateBdlMarkets,
  adminSetSportsCreationBudget,
} from './admin-sports-bdl'

type Call = (props: unknown, auth: { uid: string }) => Promise<unknown>
const [read, create, save] = [
  adminSportsCreationSettings,
  adminCreateBdlMarkets,
  adminSetSportsCreationBudget,
] as unknown as Call[]
const admin = { uid: 'admin' }
const date = '2027-04-01'
const leagueSettings = {
  league: 'nba',
  cap: 1000,
  baseAnte: 100,
  startsOn: date,
  groupSlugs: ['nba', 'nba'],
}
beforeEach(() => jest.clearAllMocks())
it.each([read, create, save])(
  'requires an administrator before database or provider work',
  async (fn) => {
    await expect(fn({}, { uid: 'trader' })).rejects.toMatchObject({ code: 403 })
    expect(createSupabaseDirectClient).not.toHaveBeenCalled()
    expect(creationSettings).not.toHaveBeenCalled()
    expect(runMajorCreation).not.toHaveBeenCalled()
    expect(saveCreationSetting).not.toHaveBeenCalled()
  }
)
it('persists league and shared caps as separate scopes with the operator identity', async () => {
  await save(leagueSettings, admin)
  expect(saveCreationSetting).toHaveBeenCalledWith(
    'pg',
    {
      scope: 'nba',
      cap: 1000,
      baseAnte: 100,
      startsOn: date,
      groupSlugs: ['nba'],
    },
    'admin'
  )
  await save({ scope: 'wave:2', cap: 0 }, admin)
  expect(saveCreationSetting).toHaveBeenCalledWith(
    'pg',
    {
      scope: 'wave:2',
      cap: 0,
      baseAnte: null,
      startsOn: null,
      groupSlugs: null,
    },
    'admin'
  )
  jest.mocked(creationSettings).mockResolvedValue([])
  await expect(read({}, admin)).resolves.toEqual({ settings: [] })
})
it('passes scoped previews to creation and rejects a competition owned by a different league', async () => {
  const props = {
    league: 'nba',
    competitionId: 'nba-regular-2026-27',
    dryRun: true,
    keys: ['bdl:nba:44'],
  }
  await expect(
    create({ ...props, league: 'mlb' }, admin)
  ).rejects.toMatchObject({ code: 400 })
  expect(runMajorCreation).not.toHaveBeenCalled()
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  await create(props, admin)
  expect(runMajorCreation).toHaveBeenCalledWith({ ...props, role: 'api' })
})
it.each([
  { startsOn: '2027-02-30' },
  { groupSlugs: ['a,b'] },
  { groupSlugs: [] },
  { baseAnte: 0 },
  { cap: -1 },
  { cap: 2147483648 },
])('rejects invalid budget inputs %p', (invalid) => {
  expect(
    API['admin-sports-set-creation-budget'].props.safeParse({
      ...leagueSettings,
      ...invalid,
    }).success
  ).toBe(false)
})
it('accepts a zero spending cap and rejects more than 200 event selections', () => {
  expect(
    API['admin-sports-set-creation-budget'].props.safeParse({
      scope: 'global',
      cap: 0,
    }).success
  ).toBe(true)
  expect(
    API['admin-sports-create-bdl-markets'].props.safeParse({
      league: 'nba',
      competitionId: 'nba',
      dryRun: true,
      keys: Array(201).fill('bdl:nba:1'),
    }).success
  ).toBe(false)
})

it.each([read, create, save])(
  'returns 404 before opening the database or calling a provider when rollout is off',
  async (call) => {
    jest.mocked(isSportsBdlEnabled).mockReturnValueOnce(false)
    await expect(call({}, admin)).rejects.toMatchObject({ code: 404 })
    expect(createSupabaseDirectClient).not.toHaveBeenCalled()
    expect(runMajorCreation).not.toHaveBeenCalled()
  }
)
it('requires exact game keys from the same league on a real or forced run', () => {
  const schema = API['admin-sports-create-bdl-markets'].props
  const base = {
    league: 'nba',
    competitionId: 'nba-regular-2026-27',
    dryRun: false,
  }
  for (const keys of [
    undefined,
    [],
    ['bdl:nhl:7'],
    ['bdl:nba:01'],
    ['bdl:nba:7:season'],
    ['bdl:nba:7', 'bad'],
  ])
    expect(schema.safeParse({ ...base, keys }).success).toBe(false)
  expect(schema.safeParse({ ...base, dryRun: true, force: true }).success).toBe(
    false
  )
  expect(schema.safeParse({ ...base, keys: ['bdl:nba:7'] }).success).toBe(true)
  expect(schema.safeParse({ ...base, dryRun: true }).success).toBe(true)
})
it('accepts registry league budgets independently of supported creation leagues', () => {
  const schema = API['admin-sports-set-creation-budget'].props
  expect(schema.safeParse({ ...leagueSettings, league: 'epl' }).success).toBe(
    true
  )
  expect(
    schema.safeParse({ ...leagueSettings, league: 'imaginary' }).success
  ).toBe(false)
  expect(
    API['admin-sports-create-bdl-markets'].props.safeParse({
      league: 'epl',
      competitionId: 'england',
      dryRun: true,
    }).success
  ).toBe(false)
})
