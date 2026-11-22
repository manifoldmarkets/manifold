import {
  BDL_GLOBAL_RUN_CAP,
  BDL_MIN_CREATION_LEAD_MS,
} from 'common/bdl/constants'
import * as settingsConstants from 'common/bdl/constants'
import { MajorLeague, MajorSettings } from 'common/bdl/major-leagues'
import { bdlEventId } from 'common/sports-ids'
import { ProviderOdds } from 'common/sports-provider'
import { calendarPhaseKey, SPORTS_CALENDAR } from 'common/sports-calendar'
import { DAY_MS } from 'common/util/time'
import { createBdlClient } from '../balldontlie-client'
import {
  createSportsContract,
  flushSportsGroupEmbeddings,
  SportsGameStartedError,
} from '../sports-markets'
import { log } from '../utils'
import { findLockedSportsMarket } from '../sports-market-dedupe'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import type { SupabaseDirectClient } from '../supabase/init'
import {
  inspectBdlCreationBudget,
  requireBdlCreationBudget,
} from './creation-budget'
import { getMajorSettings } from './major-settings'
import { majorCreationHold, existingMajorGroups } from './major-creation-store'
import { fetchMajorGames, fetchMajorOdds, MajorGame } from './major-games'
import { runMajorCreation, MajorCreationOptions } from './create-major-markets'

jest.mock('../balldontlie-client', () => ({ createBdlClient: jest.fn() }))
jest.mock('../supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('../sports-markets', () => ({
  createSportsContract: jest.fn(),
  flushSportsGroupEmbeddings: jest.fn(),
  SportsGameStartedError: class extends Error {},
  SportsMarketAlreadyExistsError: class extends Error {
    constructor(readonly contractId: string) {
      super()
    }
  },
}))
jest.mock('../sports-market-dedupe', () => ({
  findLockedSportsMarket: jest.fn(),
}))
jest.mock('../odds-markets', () => ({
  sportsCreator: async () => ({ id: 'bot' }),
}))
jest.mock('../tiptap', () => ({ anythingToRichText: (x: unknown) => x }))
jest.mock('../utils', () => ({
  isProd: () => false,
  log: { error: jest.fn(), warn: jest.fn() },
}))
jest.mock('../supabase/sports-competition-switches', () => ({
  getCompetitionSwitches: jest.fn(),
}))
jest.mock('./creation-budget', () => ({
  inspectBdlCreationBudget: jest.fn(),
  requireBdlCreationBudget: jest.fn(),
  BdlCreationBudgetError: class extends Error {},
}))
jest.mock('./major-settings', () => ({
  getMajorSettings: jest.fn(),
}))
jest.mock('./major-creation-store', () => ({
  majorCreationHold: jest.fn(),
  existingMajorGroups: jest.fn(),
}))
jest.mock('./major-games', () => ({
  fetchMajorGames: jest.fn(),
  fetchMajorOdds: jest.fn(),
}))

const initial = Date.parse('2026-10-22T12:00:00Z')
const clock = { now: jest.fn(() => initial), sleep: async () => undefined }
const db = {
  tx: async (fn: (x: unknown) => Promise<unknown>) => fn({}),
} as unknown as SupabaseDirectClient
const run = (opts: MajorCreationOptions = {}) =>
  runMajorCreation({ league: 'nba', ...opts }, { pg: db, clock })
const firstPhase = (league: MajorLeague) =>
  SPORTS_CALENDAR.find(
    (e) =>
      e.bdlLeagueKey === league &&
      e.startDate <= '2026-10-23' &&
      e.endDate >= '2026-10-23'
  )!
const enabled = (league: MajorLeague) => ({
  [calendarPhaseKey(firstPhase(league))]: true,
})
const settings = (league: MajorLeague): MajorSettings => ({
  league,
  baseAnte: 175,
  startsOn: '2026-10-01',
  groupSlugs: ['sports'],
  waveLeagueKeys: [league],
  limits: {
    perLeagueDailyAnte: 5000,
    perWaveAnte: 10000,
    globalOpenAnte: 20000,
  },
})
const game = (id: number, extra: Partial<MajorGame> = {}): MajorGame => ({
  id,
  home: { id: 10, name: 'Home' },
  away: { id: 20, name: 'Away' },
  startTime: new Date(initial + DAY_MS + id * 1000).toISOString(),
  slateDate: '2026-10-23',
  status: 'scheduled',
  homeScore: null,
  awayScore: null,
  eligible: true,
  postseason: false,
  season: 2026,
  ...extra,
})
const line = (league: MajorLeague, g: MajorGame): ProviderOdds => ({
  eventId: bdlEventId(league, g.id),
  vendor: 'polymarket',
  updatedAtMs: initial,
  outcomes: [
    { outcome: { entrantId: '20' }, americanOdds: -150 },
    { outcome: { entrantId: '10' }, americanOdds: 150 },
  ],
})
const healthy = { reason: null, lowBalance: false } as Awaited<
  ReturnType<typeof inspectBdlCreationBudget>
>
const existing = jest.mocked(findLockedSportsMarket),
  readSettings = jest.mocked(getMajorSettings),
  switches = jest.mocked(getCompetitionSwitches),
  schedule = jest.mocked(fetchMajorGames),
  odds = jest.mocked(fetchMajorOdds),
  save = jest.mocked(createSportsContract),
  hold = jest.mocked(majorCreationHold)
beforeEach(() => {
  jest.resetAllMocks()
  process.env = { ...process.env, NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true' }
  clock.now.mockReturnValue(initial)
  switches.mockResolvedValue({
    ...Object.fromEntries(
      SPORTS_CALENDAR.filter((e) => e.oddsKey).map((e) => [
        calendarPhaseKey(e),
        false,
      ])
    ),
    ...enabled('nba'),
    ...enabled('mlb'),
  })
  readSettings.mockImplementation(async (_, league) => settings(league))
  schedule.mockResolvedValue([game(1)])
  odds.mockImplementation(
    async (_, league, games) =>
      new Map(games.map((g) => [g.id, [line(league, g)]]))
  )
  jest.mocked(existingMajorGroups).mockResolvedValue(['topic'])
  hold.mockResolvedValue(null)
  existing.mockResolvedValue(null)
  jest.mocked(inspectBdlCreationBudget).mockResolvedValue(healthy)
  jest.mocked(requireBdlCreationBudget).mockResolvedValue(healthy)
  save.mockImplementation(async (_, __, params, opts) => {
    await opts!.chooseAnte!(
      {} as Parameters<NonNullable<NonNullable<typeof opts>['chooseAnte']>>[0]
    )
    opts!.groupEmbeddingBatch!.add('topic')
    return { id: 'created-' + params.sportsEventId } as Awaited<
      ReturnType<typeof save>
    >
  })
})
afterEach(() => jest.restoreAllMocks())

it('creates a priced market with its stored line, fixed answers, notified budget and one group refresh', async () => {
  const res = await run()
  expect(res).toMatchObject({
    created: 1,
    skipped: 0,
    errors: 0,
    log: [{ ante: 175, contractId: 'created-bdl:nba:1' }],
  })
  expect(save.mock.calls[0][2]).toMatchObject({
    question: 'Away at Home, Oct 23',
    sportsProvider: 'bdl',
    sportsEventId: 'bdl:nba:1',
    sportsStartKnown: true,
    sportsCompetitionId: firstPhase('nba').competitionId,
    sportsMarketType: 'moneyline',
    sportsLeague: 'NBA',
    sportsHomeTeamId: '10',
    sportsAwayTeamId: '20',
    answers: ['Away', 'Home'],
    answerProbs: [60, 40],
    openingProbs: [0.6, 0.4],
    openingLineSource: 'polymarket',
    openingLineVendors: ['polymarket'],
    openingBookCount: 0,
    openingSampledTime: initial,
    groupIds: ['topic'],
  })
  const fundingOptions = save.mock.calls[0][3]!
  expect(fundingOptions.minLeadMs).toBe(BDL_MIN_CREATION_LEAD_MS)
  expect(fundingOptions.now?.()).toBe(initial)
  expect(requireBdlCreationBudget).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ ante: 175, expectedBaseAnte: 175 })
  )
  expect(flushSportsGroupEmbeddings).toHaveBeenCalledTimes(1)
  const opts = jest.mocked(createBdlClient).mock.calls[0][0]!
  expect(opts.enabledLeagues?.has('nba')).toBe(true)
})
it('reports an elapsed lead during a funding write as a skipped game', async () => {
  save.mockRejectedValueOnce(new SportsGameStartedError('fixture'))
  const result = await run()
  expect(result).toMatchObject({
    created: 0,
    skipped: 1,
    errors: 0,
    log: [{ status: 'skipped', reason: 'kicks off too soon' }],
  })
})

const originalEnv = process.env
afterEach(() => {
  process.env = originalEnv
})
it('returns before reading switches or initializing any client with rollout off', async () => {
  delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  expect(
    (await run({ force: true, competitionId: firstPhase('nba').competitionId }))
      .log
  ).toEqual([])
  expect(switches).not.toHaveBeenCalled()
  expect(createBdlClient).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})
it('rechecks the league before subsequent pages and retry attempts', async () => {
  await run()
  const gate = jest.mocked(createBdlClient).mock.calls[0][0]?.isLeagueEnabled
  expect(gate).toBeDefined()
  expect(await gate!('nba')).toBe(true)
  switches.mockResolvedValue({})
  expect(await gate!('nba')).toBe(false)
  expect(await gate!('mlb')).toBe(false)
})
it('makes zero provider calls when all phases are off or switches cannot be read', async () => {
  switches.mockResolvedValue({})
  expect((await run()).log).toEqual([])
  switches.mockRejectedValue(new Error('unavailable'))
  await expect(run()).rejects.toThrow()
  expect(createBdlClient).not.toHaveBeenCalled()
  expect(schedule).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})
it('ignores an enabled EPL competition in the major creation job', async () => {
  const epl = SPORTS_CALENDAR.find(
    (phase) => phase.competitionId === 'epl-2026-27'
  )!
  switches.mockResolvedValue({ [calendarPhaseKey(epl)]: true })
  expect(await run({ league: undefined })).toMatchObject({
    created: 0,
    log: [],
  })
  expect(readSettings).not.toHaveBeenCalled()
  expect(schedule).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})

it('checks the enable state for the requested league even when another league is enabled', async () => {
  switches.mockResolvedValue(enabled('nba'))
  expect((await run({ league: 'mlb' })).log).toEqual([])
  expect(schedule).not.toHaveBeenCalled()
})
it('never overrides an enabled overlapping Odds phase, even when forced', async () => {
  const p = firstPhase('nba'),
    legacy = SPORTS_CALENDAR.find(
      (e) => e.oddsKey && e.competitionId === p.competitionId
    )!
  switches.mockResolvedValue({ [calendarPhaseKey(legacy)]: true })
  expect(
    (await run({ force: true, competitionId: p.competitionId })).created
  ).toBe(0)
  expect(schedule).not.toHaveBeenCalled()
})
it('only allows a targeted force and never bypasses cutover or budget', async () => {
  await expect(run({ force: true })).rejects.toThrow()
  await expect(
    run({ force: true, league: undefined, competitionId: 'c' })
  ).rejects.toThrow()
  await expect(run({ keys: Array(201).fill('x') })).rejects.toThrow()
  switches.mockResolvedValue({})
  const opts = {
    force: true,
    competitionId: firstPhase('nba').competitionId,
    dryRun: true,
  }
  expect((await run(opts)).log).toEqual([])
  expect(createBdlClient).not.toHaveBeenCalled()
  expect(schedule).not.toHaveBeenCalled()
  switches.mockResolvedValue(enabled('nba'))
  expect((await run(opts)).wouldCreate).toBe(1)
  readSettings.mockResolvedValue({
    ...settings('nba'),
    startsOn: '2026-10-25',
  })
  expect((await run(opts)).log[0].reason).toBe('game before starts_on')
})
it('funds games from starts_on inclusive using the Eastern kickoff date', async () => {
  readSettings.mockResolvedValue({ ...settings('nba'), startsOn: '2026-10-24' })
  schedule.mockResolvedValue([
    game(1, { startTime: '2026-10-24T03:59:59Z' }),
    game(2, { startTime: '2026-10-24T04:00:00Z' }),
  ])
  const result = await run()
  expect(result.log).toMatchObject([
    {
      eventId: bdlEventId('nba', 1),
      status: 'skipped',
      reason: 'game before starts_on',
    },
    { eventId: bdlEventId('nba', 2), status: 'created', ante: 175 },
  ])
  expect(save).toHaveBeenCalledTimes(1)
  expect(jest.mocked(requireBdlCreationBudget)).toHaveBeenCalledTimes(1)
})

it('only fetches or creates on phases inside the horizon; missing settings block spending', async () => {
  readSettings.mockResolvedValue(null)
  expect((await run()).log[0].reason).toBe('budget-unconfigured')
  expect(schedule).not.toHaveBeenCalled()
  expect((await run({ dryRun: true })).log[0]).toMatchObject({
    reason: 'budget-unconfigured',
    question: 'Away at Home, Oct 23',
    ante: 100,
  })
  readSettings.mockResolvedValue({
    ...settings('nba'),
    startsOn: '2028-01-01',
  })
  schedule.mockClear()
  expect((await run()).log[0].reason).toBe('game before starts_on')
  expect(schedule).not.toHaveBeenCalled()
})
it('defers games with an unknown start, non-scheduled status or unsupported stage and returns only selected keys', async () => {
  schedule.mockResolvedValue([
    game(1, { status: 'final' }),
    game(2, { eligible: false }),
    game(3, { startTime: null }),
    game(4, { status: 'unknown' }),
    game(5),
    game(6, { status: 'postponed' }),
  ])
  const keys = [1, 2, 3, 4, 6].map((i) => bdlEventId('nba', i))
  const r = await run({ keys })
  expect(r.skipped).toBe(5)
  expect(odds.mock.calls[0][2].map((g) => g.id)).toEqual([5])
  expect(r.log.map((d) => d.reason).sort()).toEqual(
    [
      'unconfirmed kickoff',
      ...Array(4).fill('ineligible game or status'),
    ].sort()
  )
  expect(save).not.toHaveBeenCalled()
})
it('uses completed schedule IDs to rule out a reissue without attempting to create a past game', async () => {
  const past = game(2, {
    status: 'final',
    startTime: new Date(initial - DAY_MS).toISOString(),
  })
  schedule.mockResolvedValue([past, game(1)])
  const report = await run({ dryRun: true })
  expect(report.log.map((x) => x.eventId)).toEqual(['bdl:nba:1'])
  expect(hold.mock.calls[0][1].seenEventIds).toEqual(['bdl:nba:2', 'bdl:nba:1'])
})
it('checks the five-minute cutoff and fourteen-day horizon including exact boundaries', async () => {
  schedule.mockResolvedValue(
    [
      BDL_MIN_CREATION_LEAD_MS,
      BDL_MIN_CREATION_LEAD_MS + 1,
      14 * DAY_MS,
      14 * DAY_MS + 1,
    ].map((lead, i) =>
      game(i + 1, { startTime: new Date(initial + lead).toISOString() })
    )
  )
  const r = await run({ dryRun: true })
  expect(
    r.log.filter((x) => x.status === 'dry-run').map((x) => x.eventId)
  ).toEqual(['bdl:nba:2', 'bdl:nba:3'])
  expect(odds.mock.calls[0][2].map((g) => g.id)).toEqual([2, 3])
})
it('reports the creation-window reason even when the odds fetch did not request an out-of-window game', async () => {
  schedule.mockResolvedValue([
    game(1, { startTime: new Date(initial + 1000).toISOString() }),
    game(2, { startTime: new Date(initial + 14 * DAY_MS + 1).toISOString() }),
  ])
  expect((await run({ dryRun: true })).log.map((d) => d.reason)).toEqual([
    'outside creation window',
    'outside creation window',
  ])
})
it('honors an off phase when two postseason windows cover the same game', async () => {
  schedule.mockResolvedValue([
    game(1, { startTime: '2026-10-25T18:00:00Z', postseason: true }),
  ])
  expect((await run({ league: 'mlb', dryRun: true })).log[0].reason).toBe(
    'no unique enabled phase'
  )
  const s = await switches(db)
  const series = SPORTS_CALENDAR.find(
    (p) => p.bdlLeagueKey === 'mlb' && p.phase === 'World Series (BDL)'
  )!
  switches.mockResolvedValue({ ...s, [calendarPhaseKey(series)]: true })
  expect((await run({ league: 'mlb', dryRun: true })).wouldCreate).toBe(1)
})
it('skips a game outside the selected phase or without a valid opening price', async () => {
  odds.mockResolvedValue(new Map())
  expect((await run()).log[0].reason).toBe('no eligible moneyline')
  expect(save).not.toHaveBeenCalled()
  expect((await run({ competitionId: 'wrong' })).log).toEqual([])
})
it('matches the actual regular or postseason to the registered phase, including an unknown stage', async () => {
  schedule.mockResolvedValue([
    game(1, { postseason: true }),
    game(2, { postseason: undefined }),
  ])
  expect((await run({ dryRun: true })).log.map((d) => d.reason)).toEqual([
    'no unique enabled phase',
    'no unique enabled phase',
  ])
  schedule.mockResolvedValue([
    game(1, { postseason: false }),
    game(2, { postseason: undefined }),
  ])
  expect(
    (await run({ league: 'mlb', dryRun: true })).log.map((d) => d.reason)
  ).toEqual(['no unique enabled phase', 'no unique enabled phase'])
})
it('counts planned games and their funding against the same caps in a dry run', async () => {
  schedule.mockResolvedValue([game(1), game(2)])
  jest
    .mocked(inspectBdlCreationBudget)
    .mockImplementation(async (_, __, p) =>
      p!.dailyAnte > 0 ? { ...healthy, reason: 'league-daily-cap' } : healthy
    )
  const r = await run({ dryRun: true })
  expect(r).toMatchObject({ created: 0, wouldCreate: 1, skipped: 1, errors: 0 })
  expect(jest.mocked(inspectBdlCreationBudget).mock.calls[1][2]).toEqual({
    dailyAnte: 175,
    waveAnte: 175,
    openAnte: 175,
    balanceDebits: 175,
  })
  expect(save).not.toHaveBeenCalled()
  expect(flushSportsGroupEmbeddings).not.toHaveBeenCalled()
})
it('logs a low balance only once per run while candidates within their caps can still proceed', async () => {
  schedule.mockResolvedValue([game(1), game(2)])
  jest
    .mocked(inspectBdlCreationBudget)
    .mockResolvedValue({ ...healthy, lowBalance: true })
  expect((await run({ dryRun: true })).wouldCreate).toBe(2)
  expect(log.error).toHaveBeenCalledTimes(1)
})
it('holds missing topics, detected prior IDs, existing markets, and latest open Odds kickoffs', async () => {
  jest.mocked(existingMajorGroups).mockResolvedValueOnce(null)
  expect((await run({ dryRun: true })).log[0].reason).toBe(
    'configured group unavailable'
  )
  existing.mockResolvedValueOnce({ id: 'old' })
  expect((await run({ dryRun: true })).log[0]).toMatchObject({
    reason: 'market already exists',
    contractId: 'old',
  })
  hold
    .mockResolvedValueOnce('possible-reid: old')
    .mockResolvedValueOnce('before latest open Odds kickoff')
  expect((await run({ dryRun: true })).log[0].reason).toBe('possible-reid: old')
  expect((await run()).log[0].reason).toBe('before latest open Odds kickoff')
})
it('checks the switch, current cutoff configuration, remaining lead and opening price again inside the transaction', async () => {
  switches.mockResolvedValueOnce(enabled('nba')).mockResolvedValueOnce({})
  expect((await run()).log[0].reason).toBe('phase disabled')
  readSettings
    .mockResolvedValueOnce(settings('nba'))
    .mockResolvedValueOnce({ ...settings('nba'), startsOn: '2026-10-25' })
  expect((await run()).log[0].reason).toBe('settings-changed')
  jest.mocked(requireBdlCreationBudget).mockImplementationOnce(async () => {
    clock.now.mockReturnValue(initial + DAY_MS)
    return healthy
  })
  expect((await run()).log[0].reason).toBe('kicks off too soon')
  clock.now.mockReturnValue(initial)
  jest.mocked(requireBdlCreationBudget).mockImplementationOnce(async () => {
    clock.now.mockReturnValue(initial + 31 * 60_000)
    return healthy
  })
  expect((await run()).log[0].reason).toBe('opening line changed or expired')
})
it('holds a disappeared or changed topic configuration under the creation lock', async () => {
  readSettings
    .mockResolvedValueOnce(settings('nba'))
    .mockResolvedValueOnce(null)
  expect((await run()).log[0].reason).toBe('settings-changed')
  readSettings
    .mockResolvedValueOnce(settings('nba'))
    .mockResolvedValueOnce({ ...settings('nba'), groupSlugs: ['replacement'] })
  expect((await run()).log[0].reason).toBe('settings-changed')
})
it('keeps both games of a doubleheader, marks Game 2 and discovers a late addition on the next scan', async () => {
  const one = game(1, { postseason: true }),
    two = game(2, { gameNumber: 2, postseason: true })
  schedule.mockResolvedValueOnce([one]).mockResolvedValueOnce([two, one])
  expect((await run({ league: 'mlb', dryRun: true })).wouldCreate).toBe(1)
  const r = await run({ league: 'mlb', dryRun: true })
  expect(r.log.map((x) => [x.eventId, x.question])).toEqual([
    ['bdl:mlb:1', 'Away at Home, Oct 23'],
    ['bdl:mlb:2', 'Away at Home, Oct 23 (Game 2)'],
  ])
  expect(hold.mock.calls.at(-1)?.[1].seenEventIds).toEqual([
    'bdl:mlb:2',
    'bdl:mlb:1',
  ])
})

it('restricts the canceled-market remedy to both a forced run and a selected event', async () => {
  const match = { competitionId: firstPhase('nba').competitionId }
  for (const opts of [
    { force: true },
    { keys: ['bdl:nba:1'] },
    { force: true, keys: ['bdl:nba:1'] },
  ]) {
    const expected = opts.force && opts.keys ? 'bdl:nba:1' : undefined
    await run({ ...match, ...opts, dryRun: true })
    expect(existing.mock.calls.at(-1)?.[3]).toBe(expected)
    await run({ ...match, ...opts })
    expect(save.mock.calls.at(-1)?.[3]?.allowCanceledEventId).toBe(expected)
  }
})

it('caps accepted games per league and across a run in earliest-start order', async () => {
  schedule.mockResolvedValue(Array.from({ length: 27 }, (_, i) => game(27 - i)))
  const r = await run({ dryRun: true })
  expect(r.wouldCreate).toBe(25)
  expect(r.log[0].eventId).toBe('bdl:nba:1')
  expect(r.log.at(-1)?.reason).toBe('run cap')
  expect(BDL_GLOBAL_RUN_CAP).toBe(300)
  const original = Object.getOwnPropertyDescriptor(
    settingsConstants,
    'BDL_GLOBAL_RUN_CAP'
  )!
  Object.defineProperty(settingsConstants, 'BDL_GLOBAL_RUN_CAP', {
    ...original,
    value: 1,
  })
  try {
    expect((await run({ dryRun: true })).wouldCreate).toBe(1)
  } finally {
    Object.defineProperty(settingsConstants, 'BDL_GLOBAL_RUN_CAP', original)
  }
})

it('holds higher transaction ante and accepts the exact confirmed maximum for that game', async () => {
  schedule.mockResolvedValue([game(1), game(2)])
  const result = await run({
    keys: ['bdl:nba:1', 'bdl:nba:2'],
    maxAntes: { 'bdl:nba:1': 174, 'bdl:nba:2': 175 },
  })
  expect(result).toMatchObject({
    created: 1,
    skipped: 1,
    log: [
      {
        eventId: 'bdl:nba:1',
        status: 'skipped',
        reason: 'ante exceeds confirmed maximum; preview again',
      },
      {
        eventId: 'bdl:nba:2',
        status: 'created',
        ante: 175,
        answerLabels: ['Away', 'Home'],
      },
    ],
  })
  expect(requireBdlCreationBudget).toHaveBeenCalledTimes(2)
})

it('reconciles every explicit key with the fresh slate, without treating a failed list as a missing game', async () => {
  const options = { keys: ['bdl:nba:1', 'bdl:nba:2'], dryRun: true }
  expect(await run(options)).toMatchObject({
    wouldCreate: 1,
    skipped: 1,
    log: [
      {
        eventId: 'bdl:nba:2',
        reason: 'selected game missing from current slate',
      },
      { eventId: 'bdl:nba:1', answerLabels: ['Away', 'Home'] },
    ],
  })
  schedule.mockRejectedValueOnce(Error('offline fixture read error'))
  expect(await run(options)).toMatchObject({
    errors: 2,
    skipped: 0,
    log: [
      { eventId: 'bdl:nba:1', status: 'error', reason: 'league unavailable' },
      { eventId: 'bdl:nba:2', status: 'error', reason: 'league unavailable' },
    ],
  })
  switches.mockResolvedValue({})
  expect((await run(options)).log).toEqual(
    options.keys.map((eventId) =>
      expect.objectContaining({
        eventId,
        status: 'skipped',
        reason: 'phase disabled',
      })
    )
  )
})

it('a force retry cannot fund an inactive regular season when NBA playoffs are on', async () => {
  const playoffs = SPORTS_CALENDAR.find(
    (entry) =>
      entry.bdlLeagueKey === 'nba' &&
      entry.competitionId === 'nba-playoffs-2027'
  )!
  const siblingOnly = { [calendarPhaseKey(playoffs)]: true }
  const opts = {
    competitionId: firstPhase('nba').competitionId,
    force: true,
    keys: ['bdl:nba:1'],
  }
  switches.mockResolvedValue(siblingOnly)
  expect((await run(opts)).created).toBe(0)
  expect(schedule).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  switches.mockResolvedValueOnce(enabled('nba')).mockResolvedValue(siblingOnly)
  const retry = await run(opts)
  expect(retry.created).toBe(0)
  expect(retry.log[0].reason).toBe('phase disabled')
})
