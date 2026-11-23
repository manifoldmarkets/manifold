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
jest.mock('shared/utils', () => ({ isProd: () => true, LOCAL_ONLY: true }))
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isAdminId: (id: string) => id === 'admin',
}))

import type { Request, Response } from 'express'
import { typedEndpoint } from './helpers/endpoint'
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
const emptyResult = {
  created: 0,
  wouldCreate: 0,
  skipped: 0,
  errors: 0,
  log: [],
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(runMajorCreation).mockResolvedValue(emptyResult)
})
it('rejects all three anonymous HTTP requests before invoking admin, storage or provider operations', async () => {
  const req = { get: () => undefined } as unknown as Request
  const res = {} as Response
  const endpoints = [
    typedEndpoint(
      'admin-sports-creation-settings',
      adminSportsCreationSettings
    ),
    typedEndpoint(
      'admin-sports-set-creation-budget',
      adminSetSportsCreationBudget
    ),
    typedEndpoint('admin-sports-create-bdl-markets', adminCreateBdlMarkets),
  ]
  for (const handle of endpoints) {
    const next = jest.fn()
    await handle(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  }
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  expect(creationSettings).not.toHaveBeenCalled()
  expect(saveCreationSetting).not.toHaveBeenCalled()
  expect(runMajorCreation).not.toHaveBeenCalled()
})
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
    'admin',
    null
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
    'admin',
    null
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
  const decision = {
    league: 'nba' as const,
    eventId: props.keys[0],
    question: 'Visitors at Hosts',
    status: 'dry-run' as const,
    reason: null,
    ante: 100,
    answerLabels: ['Visitors', 'Hosts'],
    confirmation: { awayId: 20, homeId: 10, startTime: 1_800_000_000_000 },
  }
  const line = {
    source: 'books' as const,
    vendors: ['fixture source'],
    probs: [0.45, 0.55],
    bookCount: 1,
    sampledTime: 12345678,
  }
  jest.mocked(runMajorCreation).mockResolvedValueOnce({
    ...emptyResult,
    wouldCreate: 1,
    log: [{ ...decision, line }],
  })
  await expect(create(props, admin)).resolves.toEqual({
    ...emptyResult,
    wouldCreate: 1,
    log: [decision],
  })
  expect(runMajorCreation).toHaveBeenCalledWith({
    ...props,
    operator: true,
    role: 'api',
  })
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
    expect(creationSettings).not.toHaveBeenCalled()
    expect(saveCreationSetting).not.toHaveBeenCalled()
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

it('requires confirmation of a maximum for every selected game before it can be funded', async () => {
  const props = {
    league: 'nba',
    competitionId: 'nba-regular-2026-27',
    keys: ['bdl:nba:7'],
    dryRun: false,
  }
  await expect(create(props, admin)).rejects.toMatchObject({ code: 409 })
  expect(runMajorCreation).not.toHaveBeenCalled()
  const schema = API['admin-sports-create-bdl-markets'].props
  for (const maxAntes of [
    {},
    { 'bdl:nba:8': 100 },
    { 'bdl:nba:7': -1 },
    { 'bdl:nba:7': 42.5 },
    { 'bdl:nba:7': 100, 'bdl:nba:8': 100 },
  ])
    expect(schema.safeParse({ ...props, maxAntes }).success).toBe(false)
  const maxAntes = { 'bdl:nba:7': 100 }
  await expect(create({ ...props, maxAntes }, admin)).rejects.toMatchObject({
    code: 409,
  })
  const approved = { awayId: 20, homeId: 10, startTime: 1_800_000_000_000 }
  const confirmations = { 'bdl:nba:7': approved }
  await create({ ...props, maxAntes, confirmations }, admin)
  expect(runMajorCreation).toHaveBeenCalledWith({
    ...props,
    maxAntes,
    confirmations,
    operator: true,
    role: 'api',
  })
  expect(schema.safeParse({ ...props, maxAntes, confirmations }).success).toBe(
    true
  )
  expect(
    schema.safeParse({
      ...props,
      maxAntes,
      force: true,
      confirmations: {
        'bdl:nba:7': {
          ...approved,
          canceledContractIds: ['canceled-original'],
        },
      },
    }).success
  ).toBe(true)
  for (const fields of [
    { confirmations: {} },
    { confirmations: { 'bdl:nba:7': { ...approved, awayId: 10 } } },
    { force: true, confirmations },
    {
      force: true,
      confirmations: { 'bdl:nba:7': { ...approved, canceledContractIds: [] } },
    },
    {
      confirmations: { 'bdl:nba:7': { ...approved, canceledContractIds: [] } },
    },
  ])
    expect(schema.safeParse({ ...props, maxAntes, ...fields }).success).toBe(
      false
    )
})
