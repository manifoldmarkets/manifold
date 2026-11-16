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
// What the deeper second fetch returns; defaults to the same list.
let deeperCandidates: Contract[] | undefined
let sourceRow: { question: string; creator_id: string } | null
const redis = new Map<string, { value: any; expires: number }>()
const oneOrNone = jest.fn()
const map = jest.fn()
const none = jest.fn()
const toRow = (c: Contract) => ({
  id: c.id,
  question: c.question,
  creator_id: c.creatorId ?? null,
  close_time: c.closeTime ?? null,
  deleted: c.deleted ?? null,
  is_resolved: c.isResolved ?? null,
  mechanism: c.mechanism,
  visibility: c.visibility,
})
// Each recomputation reads the source row once.
const computations = () => oneOrNone.mock.calls.length
const read = (question = 'Will A win?', limit = 2, uniqueBettorCount = 51) =>
  getRelatedMarkets(
    {
      contractId: `source-${source}`,
      limit,
      question,
      uniqueBettorCount,
    },
    undefined as never,
    {} as never
  ) as Promise<{ marketsFromEmbeddings: Contract[] }>
const expireMembership = () => jest.advanceTimersByTime(10 * MINUTE_MS + 1)
const resultIds = (result: { marketsFromEmbeddings: Contract[] }) =>
  result.marketsFromEmbeddings.map((market) => market.id)
const binary = (id: string, question: string, creatorId?: string) =>
  ({
    id,
    question,
    creatorId,
    visibility: 'public',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    closeTime: 100 * MINUTE_MS,
  } as Contract)

beforeEach(() => {
  source++
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(1_000)
  redis.clear()
  candidates = ['a', 'b'].map((id) => binary(id, `Will ${id} win?`))
  deeperCandidates = undefined
  sourceRow = { question: 'Who wins the final?', creator_id: 'source-creator' }
  oneOrNone.mockImplementation(async () => sourceRow)
  let fetches = 0
  map.mockImplementation(
    async (
      _sql: string,
      _values: unknown[],
      toCandidate: (row: unknown) => unknown
    ) => {
      const isDeeper = fetches++ % 2 === 1
      const rows = isDeeper && deeperCandidates ? deeperCandidates : candidates
      return rows.map(toRow).map(toCandidate)
    }
  )
  const tx = { oneOrNone, map, none }
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    tx: async (run: (t: typeof tx) => unknown) => run(tx),
  } as never)
  jest
    .mocked(getContractsDirect)
    .mockImplementation(async () => [
      ...candidates,
      ...(deeperCandidates ?? []),
    ])
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
  expect(computations()).toBe(2)
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
  expect(computations()).toBe(1)
  expect(getContractsDirect).toHaveBeenCalledWith(['b'], expect.anything())
})

it('rechecks eligibility on an L2 membership hit', async () => {
  redis.set(`related-markets:v3:source-${source}:limit:2`, {
    value: { marketIdsFromEmbeddings: ['a', 'b'], lastUpdated: Date.now() },
    expires: Date.now() + 10 * MINUTE_MS,
  })
  candidates[0].isResolved = true
  expect(resultIds(await read())).toEqual(['b'])
  expect(computations()).toBe(0)
  expect(promptAI).not.toHaveBeenCalled()
})

it('ignores lists cached under the previous key version', async () => {
  redis.set(`related-markets:v2:source-${source}:limit:2`, {
    value: { marketIdsFromEmbeddings: ['a'], lastUpdated: Date.now() },
    expires: Date.now() + 10 * MINUTE_MS,
  })
  expect(resultIds(await read())).toEqual(['b'])
  expect(computations()).toBe(1)
})

it.each([[['unknown']], [[1]], [['b', null]], [[]]])(
  'fails open without caching an invalid or empty model verdict %j',
  async (verdict) => {
    jest.mocked(promptAI).mockResolvedValue(verdict as never)
    expect(resultIds(await read())).toEqual(['a', 'b'])
    expect(cacheSetJson).toHaveBeenCalledTimes(1)
    expect(cacheSetJson).toHaveBeenCalledWith(
      expect.stringContaining('related-markets:v3:'),
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
  expect(computations()).toBe(2)
  expect(promptAI).toHaveBeenCalledTimes(2)
})

describe('candidate selection', () => {
  const exportBan = (subject: string) =>
    `Will China restrict exports of ${subject} on December 31, 2026?`
  const series = [
    'gallium',
    'indium',
    'samarium',
    'antimony',
    'scandium',
    'cerium',
  ].map((subject, i) => binary(`s${i}`, exportBan(subject), 'series'))

  it('collapses a same-creator series and caps one creator for every source', async () => {
    candidates = [
      ...series,
      binary(
        'price',
        "Will China's gallium export price (FOB China) be above $429/kg on June 30, 2027?",
        'series'
      ),
      binary('lithium', 'Will China ban lithium exports in 2027?', 'series'),
      binary('chips', 'Will chips be exported to China in 2027?', 'series'),
      binary(
        'other',
        'Will the US force ASML to halt exports to China before 2029?',
        'other'
      ),
    ]
    // Few bettors: no model call, so the deterministic pass alone decides.
    const result = resultIds(await read('Will China ban gallium?', 5, 3))
    expect(promptAI).not.toHaveBeenCalled()
    // One series member, at most round(5 * 0.4) = 2 from the creator while
    // another creator's market is available, then filled in rank order.
    expect(result).toEqual(['s0', 'price', 'other', 'lithium', 'chips'])
  })

  it('drops variants and copies of the source question', async () => {
    sourceRow = { question: exportBan('gallium'), creator_id: 'series' }
    candidates = [
      ...series.slice(1),
      binary(
        'copy',
        'will china restrict exports of gallium on december 31 2026',
        'x'
      ),
      binary('kept', 'Will the US force ASML to halt exports to China?', 'x'),
    ]
    expect(resultIds(await read('anything', 5, 0))).toEqual(['kept'])
  })

  it('keeps the default-search candidates ahead of the deeper pool', async () => {
    candidates = [binary('near', 'Will the Fed cut rates in December 2026?')]
    deeperCandidates = [
      binary('popular', 'Will the S&P 500 close above 8000 in 2026?'),
      ...candidates,
    ]
    expect(resultIds(await read('anything', 5, 0))).toEqual(['near', 'popular'])
  })

  it('widens the index search only for the deeper fetch, inside one transaction', async () => {
    await read('anything', 10, 0)
    expect(map).toHaveBeenCalledTimes(2)
    expect(map.mock.calls[0][1]).toEqual(['source-' + source, 0.8, 20])
    expect(map.mock.calls[1][1]).toEqual(['source-' + source, 0.8, 150])
    expect(none).toHaveBeenCalledWith('set local hnsw.ef_search = $1', [300])
    expect(none.mock.invocationCallOrder[0]).toBeGreaterThan(
      map.mock.invocationCallOrder[0]
    )
    expect(none.mock.invocationCallOrder[0]).toBeLessThan(
      map.mock.invocationCallOrder[1]
    )
  })

  it('works when the source market row is missing', async () => {
    sourceRow = null
    expect(resultIds(await read('anything', 2, 0))).toEqual(['a', 'b'])
  })
})
