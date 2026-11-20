jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))
jest.mock('shared/supabase/odds-api-usage', () => ({
  recordOddsApiUsage: jest.fn().mockResolvedValue(undefined),
}))

import { recordOddsApiUsage } from 'shared/supabase/odds-api-usage'
import { log } from 'shared/utils'
import {
  getScores,
  getUpcomingOdds,
  ODDS_RETRY_DELAYS_MS,
  SCORES_RETRY_DELAYS_MS,
} from './the-odds-api-client'

const headers = new Headers({
  'x-requests-last': '1',
  'x-requests-used': '1200',
  'x-requests-remaining': '18800',
})

const ok = { ok: true, headers, json: async () => [] } as unknown as Response
const failed = (status: number, statusText: string, retryAfter?: string) => {
  const h = retryAfter ? new Headers(headers) : headers
  if (retryAfter) h.set('retry-after', retryAfter)
  return { ok: false, status, statusText, headers: h } as Response
}
// A 200 whose body never arrived whole: the connection dropped, or the 15s
// timeout hit, while the JSON was still downloading.
const bodyDropped = {
  ok: true,
  status: 200,
  statusText: 'OK',
  headers,
  json: async () => {
    throw new Error('terminated')
  },
} as unknown as Response

// Retries wait with setTimeout. Make the waits instant and keep what they
// would have been.
const waits: number[] = []

beforeEach(() => {
  jest.clearAllMocks()
  waits.length = 0
  jest.spyOn(global, 'setTimeout').mockImplementation(((
    fn: () => void,
    ms?: number
  ) => {
    waits.push(ms ?? 0)
    fn()
    return 0
  }) as unknown as typeof setTimeout)
  process.env.THE_ODDS_API_KEY = 'test-key'
  global.fetch = jest.fn().mockResolvedValue(ok) as unknown as typeof fetch
})

afterEach(() => {
  jest.restoreAllMocks()
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

it('records quota headers on failed responses too', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce(failed(401, 'Unauthorized'))
  await expect(getScores('soccer_epl')).rejects.toThrow('401')
  expect(recordOddsApiUsage).toHaveBeenCalledWith('soccer_epl', headers)
})

it('uses one appropriate bookmaker region per feed instead of multiplying quota by regions', async () => {
  for (const [key, region] of [
    ['basketball_nba', 'us'],
    ['basketball_nbl', 'au'],
    ['basketball_euroleague', 'eu'],
    ['soccer_efl_champ', 'uk'],
  ]) {
    jest.mocked(global.fetch).mockClear()
    await getUpcomingOdds(key)
    expect(requested().searchParams.get('regions')).toBe(region)
    expect(requested().searchParams.get('markets')).toBe('h2h')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  }
})

describe('retries', () => {
  it('rides out a throttle: retries a 429 on the schedule and returns what the provider eventually sends', async () => {
    // 7 Nov 2026: the creation run's /odds calls for EPL and the NBA got a
    // 429 at the top of the hour, the job made no second attempt, and
    // Saturday's NBA slate was never created.
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(failed(429, 'Too Many Requests'))
      .mockResolvedValueOnce(failed(429, 'Too Many Requests'))
    await expect(getUpcomingOdds('basketball_nba')).resolves.toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(waits).toEqual(ODDS_RETRY_DELAYS_MS.slice(0, 2))
    // Every attempt's quota headers count.
    expect(recordOddsApiUsage).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        '/odds for basketball_nba failed (429 Too Many Requests); retry 1 of 3 in 3s'
      )
    )
  })

  it('retries a 5xx and a dropped connection too, on the shorter scores schedule', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(failed(502, 'Bad Gateway'))
      .mockRejectedValueOnce(
        new Error('The operation was aborted due to timeout')
      )
    await expect(getScores('soccer_epl')).resolves.toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(waits).toEqual(SCORES_RETRY_DELAYS_MS)
  })

  it('retries when the connection drops while the body is downloading, not just before the headers', async () => {
    // A 200 is no guarantee the JSON arrives: the body streams in after the
    // headers, and a drop there used to reject outside the retry loop.
    jest.mocked(global.fetch).mockResolvedValueOnce(bodyDropped)
    await expect(getUpcomingOdds('basketball_nba')).resolves.toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(waits).toEqual([ODDS_RETRY_DELAYS_MS[0]])
    // The 200's quota headers still count.
    expect(recordOddsApiUsage).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        '/odds for basketball_nba failed (terminated); retry 1 of 3 in 3s'
      )
    )
  })

  it('gives up on a body that never arrives whole, on the scores schedule too', async () => {
    jest.mocked(global.fetch).mockResolvedValue(bodyDropped)
    await expect(getScores('soccer_epl')).rejects.toThrow(
      'Odds API /scores error for soccer_epl: terminated (after 3 attempts)'
    )
    expect(global.fetch).toHaveBeenCalledTimes(
      SCORES_RETRY_DELAYS_MS.length + 1
    )
    expect(waits).toEqual(SCORES_RETRY_DELAYS_MS)
  })

  it('gives up after the schedule and says how many attempts it made', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValue(failed(429, 'Too Many Requests'))
    await expect(getUpcomingOdds('basketball_nba')).rejects.toThrow(
      'Odds API /odds error for basketball_nba: 429 Too Many Requests (after 4 attempts)'
    )
    expect(global.fetch).toHaveBeenCalledTimes(ODDS_RETRY_DELAYS_MS.length + 1)
    expect(waits).toEqual(ODDS_RETRY_DELAYS_MS)
  })

  it("doesn't retry a 4xx other than 429: a bad key or exhausted credits won't fix themselves", async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(failed(401, 'Unauthorized'))
    await expect(getUpcomingOdds('basketball_nba')).rejects.toThrow(
      'Odds API /odds error for basketball_nba: 401 Unauthorized'
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(waits).toEqual([])
  })

  it('waits as long as Retry-After asks, up to a minute', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(failed(429, 'Too Many Requests', '7'))
      .mockResolvedValueOnce(failed(429, 'Too Many Requests', '3600'))
    await expect(getUpcomingOdds('basketball_nba')).resolves.toEqual([])
    expect(waits).toEqual([7_000, 60_000])
  })

  it('makes a single attempt when given no retry schedule', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(failed(429, 'Too Many Requests'))
    await expect(
      getUpcomingOdds('basketball_nba', 14, { retryDelaysMs: [] })
    ).rejects.toThrow('429 Too Many Requests')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(waits).toEqual([])
  })
})
