import { resolveF1SportsMarkets } from './sports-f1-resolve'
import { getF1ClientStatus } from 'shared/balldontlie-f1-client'
import { resolveF1Markets, resolveF1TitleMarkets } from 'shared/f1-markets'
import { recordSportsHealth } from 'shared/bdl/sports-health'
import { log } from 'shared/utils'

jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: () => ({}),
}))
jest.mock('shared/balldontlie-f1-client', () => ({
  getF1ClientStatus: jest.fn(),
}))
jest.mock('shared/f1-markets', () => ({
  syncF1SessionMarkets: jest.fn(async () => ({
    moved: 0,
    closed: 0,
    marked: 0,
  })),
  resolveF1Markets: jest.fn(),
  resolveF1TitleMarkets: jest.fn(),
}))
jest.mock('shared/bdl/sports-health', () => ({ recordSportsHealth: jest.fn() }))
const before = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
afterEach(() => {
  if (before === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = before
  jest.clearAllMocks()
})
const result = {
  moved: 0,
  checked: 0,
  resolved: 0,
  waiting: 0,
  attention: 0,
  errors: 0,
  log: [],
}
it('preserves the ordinary resolver and bypasses all observations when disabled or the F1 client is unavailable', async () => {
  delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  jest.mocked(getF1ClientStatus).mockReturnValue('ready')
  jest.mocked(resolveF1Markets).mockResolvedValue(result)
  jest.mocked(resolveF1TitleMarkets).mockResolvedValue(result)
  await resolveF1SportsMarkets()
  expect(resolveF1Markets).toHaveBeenCalledWith(
    expect.anything(),
    expect.any(Set),
    undefined
  )
  expect(resolveF1TitleMarkets).toHaveBeenCalledTimes(1)
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  jest.mocked(getF1ClientStatus).mockReturnValue('rollout-disabled')
  await resolveF1SportsMarkets()
  expect(resolveF1Markets).toHaveBeenCalledTimes(1)
  expect(recordSportsHealth).not.toHaveBeenCalled()
})
it('flushes observations after both ordinary resolvers and isolates diagnostic storage errors', async () => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  const order: string[] = []
  const sample = {
    sessionId: 99,
    competitionId: 'f1-2026',
    startedAt: 1,
    observedAt: 2,
    empty: true,
  }
  jest.mocked(getF1ClientStatus).mockReturnValue('ready')
  jest
    .mocked(resolveF1Markets)
    .mockImplementation(async (_pg, _alerts, samples) => {
      order.push('sessions')
      samples?.push(sample)
      return result
    })
  jest.mocked(resolveF1TitleMarkets).mockImplementation(async () => {
    order.push('titles')
    return result
  })
  jest.mocked(recordSportsHealth).mockImplementation(async () => {
    order.push('health')
    throw Error('fixture storage unavailable')
  })
  await resolveF1SportsMarkets()
  expect(order).toEqual(['sessions', 'titles', 'health'])
  expect(recordSportsHealth).toHaveBeenCalledWith(expect.anything(), [sample])
  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining('Could not save classification observations')
  )
  jest
    .mocked(resolveF1TitleMarkets)
    .mockRejectedValueOnce(new Error('fixture title failure'))
  await expect(resolveF1SportsMarkets()).rejects.toThrow(
    'fixture title failure'
  )
  expect(recordSportsHealth).toHaveBeenCalledTimes(2)
})
