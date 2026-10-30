// For You search falls back to the basic browse query for a user with no topic
// scores. That path must still honour Uninterested marks: hidden markets stay
// out and recent marks weigh their topics down across a bounded window, while
// a user with scores keeps the personalized query untouched.
jest.mock('./utils', () => ({
  LOCAL_ONLY: true,
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  contractColumnsToSelectWithPrefix: (prefix: string) =>
    `${prefix}.id,${prefix}.importance_score,${prefix}.freshness_score,${prefix}.data`,
}))
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  pgp: jest.requireActual('pg-promise')(),
}))
jest.mock('./topic-interests', () => ({
  userIdsToAverageTopicConversionScores: {},
  buildUserInterestsCache: jest.fn(async () => undefined),
}))
jest.mock('./supabase/contracts', () => ({
  getContractPrivacyWhereSQLFilter: () => `visibility = 'public'`,
}))

import { DISINTEREST_RANKING_WINDOW } from 'common/disinterests'
import { createSupabaseDirectClient } from './supabase/init'
import { getForYouSQL } from './supabase/search-contracts'
import { userIdsToAverageTopicConversionScores } from './topic-interests'

const COUNTS_SQL = 'count(distinct ud.contract_id)'
type Count = { group_id: string; n: number }

const useDb = (counts: Count[]) => {
  const pg = {
    // The score thresholds the warm path loads once per process.
    one: jest.fn(
      async (
        _sql: string,
        _args: unknown[],
        cb: (r: {
          importance_score: number
          freshness_score: number
        }) => unknown
      ) => cb({ importance_score: 1, freshness_score: 1 })
    ),
    manyOrNone: jest.fn(async (sql: string) =>
      sql.includes(COUNTS_SQL) ? counts : []
    ),
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
}
const args = {
  uid: 'u',
  limit: 20,
  offset: 0,
  sort: 'score',
  filter: 'all',
  contractType: 'ALL',
  token: 'MANA' as const,
}
const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim()
const HIDE_CLAUSE = "ud.user_id = 'u' and ud.contract_id = contracts.id"

describe('For You search cold start', () => {
  test('with recent marks re-ranks a window of the basic browse order', async () => {
    useDb([{ group_id: 'nfl', n: 1 }])

    const sql = squash(await getForYouSQL(args))

    expect(sql).toContain('with candidates as (select contracts.id')
    expect(sql).toContain(HIDE_CLAUSE)
    expect(sql).toContain(
      `order by importance_score desc limit ${DISINTEREST_RANKING_WINDOW})`
    )
    expect(sql).toContain("array['nfl']::text[], array[0.5]::float8[]")
    expect(sql).toContain(
      'order by c.importance_score * coalesce(p.multiplier, 1) desc, c.importance_score desc, c.id'
    )
    expect(sql).toMatch(/limit 20$/)
    // Never the personalized shape: it inner-joins the topics it is given.
    expect(sql).not.toContain('avg_conversion_score')
  })

  test('a deep page widens the window to reach it and offsets within it', async () => {
    useDb([{ group_id: 'nfl', n: 1 }])

    const sql = squash(await getForYouSQL({ ...args, offset: 300 }))

    expect(sql).toContain('order by importance_score desc limit 320)')
    expect(sql).toMatch(/limit 20 offset 300$/)
  })

  test('penalizes the freshness sort when that is the order asked for', async () => {
    useDb([{ group_id: 'nfl', n: 1 }])

    const sql = squash(await getForYouSQL({ ...args, sort: 'freshness-score' }))

    expect(sql).toContain('order by freshness_score desc limit')
    expect(sql).toContain(
      'order by c.freshness_score * coalesce(p.multiplier, 1) desc'
    )
  })

  test('a cursor page starts at its cursor, not at an offset', async () => {
    useDb([{ group_id: 'nfl', n: 1 }])

    const sql = squash(
      await getForYouSQL({ ...args, offset: 40, beforeTime: 1700000000000 })
    )

    expect(sql).toContain('created_time < millis_to_ts(1700000000000)')
    expect(sql).toMatch(/limit 20$/)
  })

  test('without marks is the basic browse order it always was, minus hidden markets', async () => {
    useDb([])

    const sql = squash(await getForYouSQL({ ...args, offset: 20 }))

    expect(sql).not.toContain('with candidates')
    expect(sql).toContain(HIDE_CLAUSE)
    expect(sql).toMatch(/order by importance_score desc limit 20 offset 20$/)
  })

  test('a user with topic scores keeps the personalized query', async () => {
    userIdsToAverageTopicConversionScores.warm = { topic: 0.5 }
    try {
      useDb([{ group_id: 'topic', n: 1 }])
      const sql = squash(await getForYouSQL({ ...args, uid: 'warm' }))
      expect(sql).toContain('avg_conversion_score')
      expect(sql).not.toContain('with candidates')
    } finally {
      delete userIdsToAverageTopicConversionScores.warm
    }
  })
})
