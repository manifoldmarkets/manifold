import { Contract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import {
  computeContractScores,
  getTodayDiscussion,
  mergeCounts,
} from './importance-score'
import { SupabaseDirectClient } from './supabase/init'

const now = Date.UTC(2026, 9, 19)
const market = {
  id: 'c1',
  mechanism: 'cpmm-1',
  outcomeType: 'BINARY',
  createdTime: now - 10 * DAY_MS,
  closeTime: now + 60 * DAY_MS,
  lastUpdatedTime: now - DAY_MS,
  isResolved: false,
  prob: 0.5,
  probChanges: { day: 0, week: 0, month: 0 },
  volume: 1000,
  volume24Hours: 10,
  uniqueBettorCount: 10,
  visibility: 'public',
} as unknown as Contract

const importance = (discussionToday: number) =>
  computeContractScores(now, market, discussionToday, 0, 0, 0, 0, 0, false)
    .importanceScore

test('discussion counts add per market and ignore non-finite counts', () => {
  expect(
    mergeCounts(
      [
        ['a', 2],
        ['b', 1],
      ],
      [
        ['a', 3],
        ['c', NaN],
      ]
    )
  ).toEqual({ a: 5, b: 1 })
})

test('Yaps count toward the same discussion total as comments', async () => {
  const pg = {
    func: jest.fn(async () => [{ contract_id: 'c1', comment_count: 2 }]),
    manyOrNone: jest.fn(async () => [
      { contract_id: 'c1', n: 1 },
      { contract_id: 'c2', n: 3 },
    ]),
  } as unknown as SupabaseDirectClient
  expect(await getTodayDiscussion(pg)).toEqual({ c1: 3, c2: 3 })
  const sql = (pg.manyOrNone as jest.Mock).mock.calls[0][0] as string
  // Once per author, live posts only, and not again where mirrored as a comment.
  expect(sql).toContain('count(distinct s.user_id)')
  expect(sql).toContain('s.deleted_time is null')
  expect(sql).toContain('s.market_comment_id is null')
  // A mirrored Yap still counts for its other attached markets.
  expect(sql).toContain('s.source_contract_id is distinct from m.contract_id')
})

test('a Yap raises importance exactly as much as a comment', () => {
  expect(importance(1)).toBeGreaterThan(importance(0))
  const [comment, yap] = [mergeCounts([['c1', 1]]), mergeCounts([['c1', 1]])]
  expect(importance(comment.c1)).toBe(importance(yap.c1))
  expect(importance(3)).toBeGreaterThan(importance(1))
})
