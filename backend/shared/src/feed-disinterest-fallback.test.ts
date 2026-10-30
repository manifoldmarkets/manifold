// The two feed endpoints fall back to plain trending order for a user with no
// topic scores. That path must still honour the user's Uninterested marks:
// hidden markets stay out and recent marks weigh their topics down, without
// routing a disliked-topics-only map into the personalized query's inner join.
jest.mock('./utils', () => ({
  LOCAL_ONLY: true,
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  contractColumnsToSelect: 'id, data',
}))
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  pgp: jest.requireActual('pg-promise')(),
}))
jest.mock('./topic-interests', () => ({
  userIdsToAverageTopicConversionScores: {},
  activeTopics: {},
  buildUserInterestsCache: jest.fn(async () => undefined),
  minimumContractsQualityBarWhereClauses: () => [],
}))
jest.mock('./supabase/search-contracts', () => ({
  privateUserBlocksSql: () => undefined,
}))
jest.mock('./supabase/reposts', () => ({
  getFollowedReposts: jest.fn(async () => []),
  getTopicReposts: jest.fn(async () => []),
}))

import { Request } from 'express'
import { DISINTEREST_RANKING_WINDOW } from 'common/disinterests'
import { getFeed } from 'api/get-feed'
import { getUnifiedFeed } from 'api/get-unified-feed'
import { createSupabaseDirectClient } from './supabase/init'
import { userIdsToAverageTopicConversionScores } from './topic-interests'

const COUNTS_SQL = 'count(distinct ud.contract_id)'
type Count = { group_id: string; n: number }

// Captures every statement the handlers would run; nothing is executed.
const makeDb = (counts: Count[]) => {
  const mapped: string[] = []
  const pg = {
    one: jest.fn(async () => ({ data: {} })),
    oneOrNone: jest.fn(
      async (
        _sql: string,
        _args: unknown[],
        cb?: (r: { data: Record<string, never> }) => unknown
      ) => (cb ? cb({ data: {} }) : { data: {} })
    ),
    manyOrNone: jest.fn(async (sql: string) =>
      sql.includes(COUNTS_SQL) ? counts : []
    ),
    map: jest.fn(async (sql: string) => {
      mapped.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
    multi: jest.fn(async () => [[], [], [], []]),
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  return { pg, mapped }
}
const req = {} as Request
const HIDE_CLAUSE = "ud.user_id = 'u' and ud.contract_id = contracts.id"
const trendingOf = (mapped: string[]) =>
  mapped.filter((sql) => sql.includes('order by importance_score desc'))

describe('get-feed cold start', () => {
  test('with recent marks re-ranks a window of trending markets and keeps hidden ones out', async () => {
    const { mapped } = makeDb([{ group_id: 'nfl', n: 1 }])

    await getFeed({ userId: 'u', limit: 7, offset: 0 }, undefined, req)

    const [sql] = trendingOf(mapped)
    expect(sql).toContain(
      'with candidates as (select id, data, importance_score'
    )
    expect(sql).toContain(HIDE_CLAUSE)
    expect(sql).toContain(
      `order by importance_score desc limit ${DISINTEREST_RANKING_WINDOW})`
    )
    expect(sql).toContain("array['nfl']::text[], array[0.5]::float8[]")
    expect(sql).toContain(
      'order by c.importance_score * coalesce(p.multiplier, 1) desc'
    )
    // get-feed has always asked for four pages' worth here.
    expect(sql).toMatch(/limit 28$/)
  })

  test('without marks is the trending order it always was, minus hidden markets', async () => {
    const { mapped } = makeDb([])

    await getFeed({ userId: 'u', limit: 7, offset: 14 }, undefined, req)

    const [sql] = trendingOf(mapped)
    expect(sql).not.toContain('with candidates')
    expect(sql).toContain(HIDE_CLAUSE)
    expect(sql).toMatch(/order by importance_score desc limit 28 offset 14$/)
  })

  test('a user with topic scores keeps the personalized query', async () => {
    userIdsToAverageTopicConversionScores.warm = { topic: 0.5 }
    try {
      const { mapped } = makeDb([{ group_id: 'topic', n: 1 }])
      await getFeed({ userId: 'warm', limit: 7, offset: 0 }, undefined, req)
      expect(mapped.some((sql) => sql.includes('topic_conversion_score'))).toBe(
        true
      )
      expect(mapped.some((sql) => sql.includes('with candidates'))).toBe(false)
    } finally {
      delete userIdsToAverageTopicConversionScores.warm
    }
  })
})

describe('get-unified-feed cold start', () => {
  const props = {
    feedLimit: 3,
    feedOffset: 6,
    activityLimit: 5,
    activityOffset: 0,
    minBetAmount: 100,
    blockedGroupSlugs: [],
    blockedContractIds: [],
  }

  test('with recent marks re-ranks a window and pages through it', async () => {
    const { mapped } = makeDb([{ group_id: 'golf', n: 3 }])

    await getUnifiedFeed({ ...props, userId: 'u' }, undefined, req)

    const [sql] = trendingOf(mapped)
    expect(sql).toContain(
      'with candidates as (select id, data, importance_score'
    )
    expect(sql).toContain(HIDE_CLAUSE)
    expect(sql).toContain(
      `order by importance_score desc limit ${DISINTEREST_RANKING_WINDOW})`
    )
    expect(sql).toContain("array['golf']::text[], array[0.125]::float8[]")
    expect(sql).toMatch(/limit 3 offset 6$/)
  })

  test('without marks keeps its trending order, minus hidden markets', async () => {
    const { mapped } = makeDb([])

    await getUnifiedFeed({ ...props, userId: 'u' }, undefined, req)

    const [sql] = trendingOf(mapped)
    expect(sql).not.toContain('with candidates')
    expect(sql).toContain(HIDE_CLAUSE)
    expect(sql).toMatch(/order by importance_score desc limit 3 offset 6$/)
  })

  test('signed out, the trending query carries no per-user clause and no re-ranking', async () => {
    const { mapped } = makeDb([{ group_id: 'golf', n: 3 }])

    await getUnifiedFeed({ ...props, userId: undefined }, undefined, req)

    const [sql] = trendingOf(mapped)
    expect(sql).not.toContain('user_disinterests')
    expect(sql).not.toContain('with candidates')
    expect(sql).toMatch(/order by importance_score desc limit 3 offset 6$/)
  })
})
