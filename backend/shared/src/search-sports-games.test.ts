jest.mock('shared/supabase/init', () => ({
  ...jest.requireActual('shared/supabase/init'),
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/sports-index', () => ({
  getSportsIndex: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  ...jest.requireActual('shared/utils'),
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))
jest.mock('shared/redis/cache', () => ({
  cacheGetJson: jest.fn(),
  cacheSetJson: jest.fn(),
}))
jest.mock('shared/analytics', () => ({ getIp: jest.fn() }))
jest.mock('shared/helpers/openai-utils', () => ({
  EMBEDDING_MODEL: 'test-embedding',
  generateEmbeddings: jest.fn(),
}))
jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))

import { searchProps } from 'common/api/market-search-types'
import { buildSportsIndex } from 'common/sports-schedule'
import { searchMarketsFull } from 'api/search-contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getSportsIndex } from 'shared/supabase/sports-index'
import { log } from 'shared/utils'

// A row the way the search reads one (contractColumnsToSelectWithPrefix).
const row = (id: string, importance: number, createdTime = 0) => ({
  data: { id, question: id, createdTime, uniqueBettorCount: 0 },
  importance_score: importance,
})

// Tonight's game first: the database returns them by close time.
const games = [row('game-tonight', 0.1), row('game-tomorrow', 0.4)]
const keywordMatches = [row('nba-champion', 0.9), row('nba-mvp', 0.5)]

const isGamesQuery = (sql: string) =>
  sql.includes(`data->>'sportsEventId' is not null`)

let gamesQuery: jest.Mock
const pg = {
  // One result set per match tier; the keyword matches come from the title
  // tier that keeps stopwords.
  multi: jest.fn(async (sql: string) =>
    sql
      .split(';')
      .map((statement) =>
        statement.includes('question_nostop_fts') ? keywordMatches : []
      )
  ),
  map: jest.fn(async (sql: string, _values: unknown, convert: any) =>
    isGamesQuery(sql)
      ? (await gamesQuery(sql)).slice(0, limitOf(sql)).map(convert)
      : []
  ),
}
const limitOf = (sql: string) => Number(/\blimit (\d+)/.exec(sql)?.[1])

const search = async (props: Record<string, unknown>) =>
  (await searchMarketsFull(
    searchProps.parse({ limit: 40, ...props }),
    undefined as never,
    {} as never
  )) as { id: string; searchMatchType?: string }[]

beforeEach(() => {
  jest.clearAllMocks()
  gamesQuery = jest.fn(async () => games)
  ;(createSupabaseDirectClient as jest.Mock).mockReturnValue(pg)
  ;(getSportsIndex as jest.Mock).mockResolvedValue(buildSportsIndex([], []))
})

describe('searching for a sport', () => {
  it("puts the sport's games first, soonest first, then the rest", async () => {
    const results = await search({ term: 'nba' })
    expect(results.map((r) => [r.id, r.searchMatchType])).toEqual([
      ['game-tonight', 'sports-game'],
      ['game-tomorrow', 'sports-game'],
      ['nba-champion', 'lexical'],
      ['nba-mvp', 'lexical'],
    ])
    const sql = gamesQuery.mock.calls[0][0] as string
    expect(sql).toContain(
      `lower(contracts.data->>'sportsLeague') = any(array['nba'])`
    )
    expect(sql).toContain('limit 6')
  })

  it('finds the sport through words around its name', async () => {
    const results = await search({ term: 'NBA games tonight' })
    expect(results[0].id).toBe('game-tonight')
  })

  it('places the games by the sort when it is not relevance', async () => {
    gamesQuery = jest.fn(async () => [
      row('old-game', 0.1, 1),
      row('new-game', 0.2, 5),
    ])
    const results = await search({ term: 'nba', sort: 'newest' })
    expect(results.map((r) => r.id)).toEqual([
      'new-game',
      'old-game',
      'nba-champion',
      'nba-mvp',
    ])
  })

  it('keeps the games to half a small page', async () => {
    await search({ term: 'nba', limit: 4 })
    expect(gamesQuery.mock.calls[0][0]).toContain('limit 2')
    gamesQuery.mockClear()
    await search({ term: 'nba', limit: 1 })
    expect(gamesQuery).not.toHaveBeenCalled()
  })

  it('cuts every page from one list that starts with the games', async () => {
    const first = await search({ term: 'nba', limit: 2 })
    const second = await search({ term: 'nba', limit: 2, offset: 2 })
    expect([...first, ...second].map((r) => r.id)).toEqual([
      'game-tonight',
      'nba-champion',
      'nba-mvp',
    ])
  })

  it('still searches when the games fail to load', async () => {
    gamesQuery = jest.fn(async () => {
      throw new Error('statement timeout')
    })
    const results = await search({ term: 'nba' })
    expect(results.map((r) => r.id)).toEqual(['nba-champion', 'nba-mvp'])
    expect(log.error).toHaveBeenCalledWith(
      'Sports games search failed',
      expect.anything()
    )
  })
})

describe('searching for anything else', () => {
  it('looks for no games', async () => {
    const results = await search({ term: 'lakers trade' })
    expect(results.map((r) => r.id)).toEqual(['nba-champion', 'nba-mvp'])
    expect(gamesQuery).not.toHaveBeenCalled()
  })

  it('leaves the topic tree alone without a search term', async () => {
    // Sorted by newest, a term-less search takes the filtered route too.
    await search({ term: '', sort: 'newest' })
    expect(pg.multi).toHaveBeenCalled()
    expect(getSportsIndex).not.toHaveBeenCalled()
    expect(gamesQuery).not.toHaveBeenCalled()
  })
})
