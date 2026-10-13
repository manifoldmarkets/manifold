jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))
jest.mock('shared/supabase/odds-api-usage', () => ({
  recordOddsApiUsage: jest.fn().mockResolvedValue(undefined),
}))

import { recordOddsApiUsage } from 'shared/supabase/odds-api-usage'
import { getScores } from './the-odds-api-client'

const headers = new Headers({
  'x-requests-last': '1',
  'x-requests-used': '1200',
  'x-requests-remaining': '18800',
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.THE_ODDS_API_KEY = 'test-key'
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers,
    json: async () => [],
  }) as unknown as typeof fetch
})

const requested = () =>
  new URL(jest.mocked(global.fetch).mock.calls[0][0] as string)

it('asks for live games only (1 credit) unless finished ones are needed', async () => {
  await getScores('icehockey_nhl')
  expect(requested().pathname).toBe('/v4/sports/icehockey_nhl/scores')
  expect(requested().searchParams.has('daysFrom')).toBe(false)

  jest.mocked(global.fetch).mockClear()
  await getScores('icehockey_nhl', { finishedDays: 3 })
  expect(requested().searchParams.get('daysFrom')).toBe('3')
})

it('records what each call cost against its sport', async () => {
  await getScores('soccer_epl')
  expect(recordOddsApiUsage).toHaveBeenCalledWith('soccer_epl', headers)
})
