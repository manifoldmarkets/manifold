jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn() }),
  metrics: { inc: jest.fn() },
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({
  getContractsDirect: jest.fn(),
}))
jest.mock('shared/redis/cache', () => ({
  cacheGetJson: jest.fn(),
  cacheSetJson: jest.fn(),
}))
jest.mock('shared/helpers/embeddings', () => ({
  TOPIC_SIMILARITY_THRESHOLD: 0.8,
}))
jest.mock('shared/helpers/prompt-ai', () => ({
  aiModels: { flashLite: 'gemini-test', haiku: 'claude-test' },
  promptAI: jest.fn(),
}))

import { Contract } from 'common/contract'
import { MINUTE_MS } from 'common/util/time'
import { getRelatedMarkets } from 'api/get-related-markets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContractsDirect } from 'shared/supabase/contracts'
import { cacheGetJson, cacheSetJson } from 'shared/redis/cache'
import { promptAI } from './prompt-ai'

let source = 0
let candidates: Contract[]
const redis = new Map<string, { value: any; expires: number }>()
const map = jest.fn()
const read = (question = 'Will A win?') =>
  getRelatedMarkets(
    {
      contractId: `source-${source}`,
      limit: 2,
      question,
      uniqueBettorCount: 51,
    },
    undefined as never,
    {} as never
  ) as Promise<{ marketsFromEmbeddings: Contract[] }>
const expireMembership = () => jest.advanceTimersByTime(10 * MINUTE_MS + 1)
const resultIds = (result: { marketsFromEmbeddings: Contract[] }) =>
  result.marketsFromEmbeddings.map((market) => market.id)

beforeEach(() => {
  source++
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(1_000)
  redis.clear()
  candidates = ['a', 'b'].map(
    (id) =>
      ({
        id,
        question: `Will ${id} win?`,
        visibility: 'public',
        mechanism: 'cpmm-1',
        outcomeType: 'BINARY',
        closeTime: 100 * MINUTE_MS,
      } as Contract)
  )
  map.mockImplementation(async () => candidates)
  jest.mocked(createSupabaseDirectClient).mockReturnValue({ map } as never)
  jest.mocked(getContractsDirect).mockImplementation(async () => candidates)
  jest.mocked(cacheGetJson).mockImplementation(async (key) => {
    const entry = redis.get(key)
    return entry && entry.expires > Date.now() ? entry.value : undefined
  })
  jest.mocked(cacheSetJson).mockImplementation(async (key, value, ttl) => {
    redis.set(key, { value, expires: Date.now() + ttl * 1_000 })
  })
  jest.mocked(promptAI).mockResolvedValue(['b'] as never)
})

afterEach(() => jest.useRealTimers())

it('reuses the verdict after the ten-minute membership cache expires', async () => {
  expect(resultIds(await read())).toEqual(['b'])
  expireMembership()
  expect(resultIds(await read())).toEqual(['b'])
  expect(map).toHaveBeenCalledTimes(2)
  expect(promptAI).toHaveBeenCalledTimes(1)
  expect(cacheSetJson).toHaveBeenCalledWith(
    expect.stringContaining('related-markets-filter:v2:'),
    ['b'],
    24 * 60 * 60
  )
})

it.each(['source title', 'candidate title', 'candidate membership'])(
  'recomputes the verdict when %s changes',
  async (change) => {
    await read()
    expireMembership()
    if (change === 'candidate title') candidates[0].question = 'Will A lose?'
    if (change === 'candidate membership') candidates = candidates.slice(1)
    await read(change === 'source title' ? 'Will A lose?' : 'Will A win?')
    expect(promptAI).toHaveBeenCalledTimes(2)
  }
)

it('rechecks eligibility on an L1 membership hit', async () => {
  await read()
  candidates[1].visibility = 'unlisted'
  expect(resultIds(await read())).toEqual([])
  expect(map).toHaveBeenCalledTimes(1)
  expect(getContractsDirect).toHaveBeenCalledWith(['b'], expect.anything())
})

it('rechecks eligibility on an L2 membership hit', async () => {
  redis.set(`related-markets:v2:source-${source}:limit:2`, {
    value: { marketIdsFromEmbeddings: ['a', 'b'], lastUpdated: Date.now() },
    expires: Date.now() + 10 * MINUTE_MS,
  })
  candidates[0].isResolved = true
  expect(resultIds(await read())).toEqual(['b'])
  expect(map).not.toHaveBeenCalled()
  expect(promptAI).not.toHaveBeenCalled()
})

it.each([[['unknown']], [[1]], [['b', null]], [[]]])(
  'fails open without caching an invalid or empty model verdict %j',
  async (verdict) => {
    jest.mocked(promptAI).mockResolvedValue(verdict as never)
    expect(resultIds(await read())).toEqual(['a', 'b'])
    expect(cacheSetJson).toHaveBeenCalledTimes(1)
    expect(cacheSetJson).toHaveBeenCalledWith(
      expect.stringContaining('related-markets:v2:'),
      expect.anything(),
      600
    )
  }
)

it('discards malformed cached verdicts and asks the model again', async () => {
  await read()
  const key = [...redis.keys()].find((key) =>
    key.startsWith('related-markets-filter:')
  )!
  redis.get(key)!.value = ['unknown']
  expireMembership()
  expect(resultIds(await read())).toEqual(['b'])
  expect(promptAI).toHaveBeenCalledTimes(2)
})

it('fails open on provider errors and retries after membership expiry', async () => {
  jest.mocked(promptAI).mockRejectedValueOnce(new Error('provider unavailable'))
  expect(resultIds(await read())).toEqual(['a', 'b'])
  expireMembership()
  expect(resultIds(await read())).toEqual(['b'])
  expect(promptAI).toHaveBeenCalledTimes(2)
})

it('still works when Redis is disabled, without extending membership freshness', async () => {
  jest.mocked(cacheGetJson).mockResolvedValue(undefined)
  jest.mocked(cacheSetJson).mockResolvedValue(undefined)
  expect(resultIds(await read())).toEqual(['b'])
  expireMembership()
  expect(resultIds(await read())).toEqual(['b'])
  expect(map).toHaveBeenCalledTimes(2)
  expect(promptAI).toHaveBeenCalledTimes(2)
})
