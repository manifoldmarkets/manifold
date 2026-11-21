import { getF1ClientStatus } from './balldontlie-f1-client'
import { log } from './utils'
import { createSupabaseDirectClient } from './supabase/init'
import { createF1SportsMarkets } from '../../scheduler/src/jobs/sports-f1-create'
import { resolveF1SportsMarkets } from '../../scheduler/src/jobs/sports-f1-resolve'

jest.mock('shared/balldontlie-f1-client', () => ({
  getF1ClientStatus: jest.fn(),
}))
jest.mock('shared/utils', () => ({ log: jest.fn() }))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/f1-markets', () => ({}))

it('quietly skips disabled dev F1 jobs and retains both missing-key diagnostics', async () => {
  jest.mocked(getF1ClientStatus).mockReturnValue('rollout-disabled')
  await createF1SportsMarkets()
  await resolveF1SportsMarkets()
  expect(log).not.toHaveBeenCalled()
  jest.mocked(getF1ClientStatus).mockReturnValue('missing-key')
  await createF1SportsMarkets()
  await resolveF1SportsMarkets()
  await resolveF1SportsMarkets()
  expect(jest.mocked(log).mock.calls).toEqual([
    ['[sports-f1-create] BALLDONTLIE_API_KEY not set — skipping'],
    ['[sports-f1-resolve] BALLDONTLIE_API_KEY not set — skipping'],
  ])
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
})
