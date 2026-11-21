import { isSportsBdlEnabled } from 'common/bdl/rollout'
jest.mock('common/bdl/rollout', () => ({
  isSportsBdlEnabled: jest.fn(() => true),
}))
import {
  adminSportsScorePolling,
  adminSportsSetScorePolling,
} from '../../api/src/admin-sports-score-polling'
import { setScorePolling } from './supabase/sports-score-polling'
import { createSupabaseDirectClient } from './supabase/init'
import type { ScorePollingPanel } from 'common/sports-score-polling'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => 'db'),
}))
jest.mock('shared/utils', () => ({ log: jest.fn() }))
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isAdminId: (id: string) => id === 'admin',
}))
jest.mock('shared/supabase/odds-api-usage', () => ({
  getOddsApiUsageSummary: async () => ({
    remaining: null,
    used: null,
    asOf: null,
    byDay: [],
    bySport: [],
  }),
}))
jest.mock('shared/supabase/sports-score-polling', () => ({
  getLegacyScorePollingGames: jest.fn(async () => [{ contractId: 'legacy' }]),
  getScorePollingRows: async () => [
    { target: 'league:nba', intervalSeconds: 120 },
    { target: 'game:demo', intervalSeconds: 0 },
  ],
  getScorePollingGames: async () => [{ contractId: 'demo', leagueKey: 'nba' }],
  setScorePolling: jest.fn(),
}))

type Handler<R> = (props: unknown, auth: { uid: string }) => Promise<R>
const get = adminSportsScorePolling as unknown as Handler<ScorePollingPanel>
const save = adminSportsSetScorePolling as unknown as Handler<{
  intervalSeconds: number | null
}>

beforeEach(() => jest.clearAllMocks())
it('rejects unauthorized reads/writes and invalid league intervals before opening the database', async () => {
  await expect(get({}, { uid: 'member' })).rejects.toMatchObject({ code: 403 })
  await expect(
    save({ target: 'league:nba', intervalSeconds: 60 }, { uid: 'member' })
  ).rejects.toMatchObject({ code: 403 })
  await expect(
    save({ target: 'league:nba:other', intervalSeconds: 60 }, { uid: 'admin' })
  ).rejects.toMatchObject({ code: 400 })
  await expect(
    save({ target: 'league:nba', intervalSeconds: 1 }, { uid: 'admin' })
  ).rejects.toMatchObject({ code: 400 })
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  expect(setScorePolling).not.toHaveBeenCalled()
})
it('publishes league defaults and permits an admin to reset one target', async () => {
  const result = await get({}, { uid: 'admin' })
  expect(result.leagues?.find((s) => s.leagueKey === 'nba')).toEqual({
    leagueKey: 'nba',
    intervalSeconds: 120,
    isDefault: false,
  })
  expect(result.leagues?.find((s) => s.leagueKey === 'wnba')).toEqual({
    leagueKey: 'wnba',
    intervalSeconds: 0,
    isDefault: true,
  })
  expect(result.games).toEqual([
    { contractId: 'demo', leagueKey: 'nba', overrideSeconds: 0 },
  ])
  await expect(
    save(
      { target: 'league:fifa/worldcup', intervalSeconds: null },
      { uid: 'admin' }
    )
  ).resolves.toEqual({ intervalSeconds: null })
  expect(setScorePolling).toHaveBeenCalledWith('db', {
    target: 'league:fifa/worldcup',
    intervalSeconds: null,
    userId: 'admin',
  })
})

it('returns the historical Odds-only panel and refuses league writes with rollout off', async () => {
  jest.mocked(isSportsBdlEnabled).mockReturnValue(false)
  try {
    const panel = await get({}, { uid: 'admin' })
    expect(panel.leagues).toBeUndefined()
    expect(panel.games).toEqual([
      { contractId: 'legacy', overrideSeconds: null },
    ])
    await expect(
      save({ target: 'league:nba', intervalSeconds: 60 }, { uid: 'admin' })
    ).rejects.toMatchObject({
      code: 400,
      message: 'Unknown setting league:nba',
    })
    expect(setScorePolling).not.toHaveBeenCalled()
  } finally {
    jest.mocked(isSportsBdlEnabled).mockReturnValue(true)
  }
})
