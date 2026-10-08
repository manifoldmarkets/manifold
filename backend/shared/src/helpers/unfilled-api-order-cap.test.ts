import { APIError } from 'common/api/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  MAX_SHORT_LIVED_UNFILLED_API_ORDERS_PER_DAY as CAP,
  SHORT_LIVED_ORDER_SECONDS,
  UNFILLED_API_ORDER_RECOUNT_MS,
  assertUnderUnfilledApiOrderCap,
  resetUnfilledApiOrderCountsForTests,
} from './unfilled-api-order-cap'

const pgCounting = (...counts: number[]) => {
  const one = jest.fn()
  for (const n of counts)
    one.mockImplementationOnce((_q, _v, map) => Promise.resolve(map({ n })))
  return { pg: { one } as unknown as SupabaseDirectClient, one }
}

beforeEach(() => resetUnfilledApiOrderCountsForTests())

test('allows a user under the cap and caches the count', async () => {
  const { pg, one } = pgCounting(CAP - 1)
  await assertUnderUnfilledApiOrderCap(pg, 'u', 0)
  await assertUnderUnfilledApiOrderCap(pg, 'u', 1000)
  expect(one).toHaveBeenCalledTimes(1)
  expect(one.mock.calls[0][1]).toEqual(['u', CAP, SHORT_LIVED_ORDER_SECONDS])
})

test('rejects a user at the cap with a 429', async () => {
  const { pg } = pgCounting(CAP)
  const error = await assertUnderUnfilledApiOrderCap(pg, 'u', 0).catch((e) => e)
  expect(error).toBeInstanceOf(APIError)
  expect(error.code).toBe(429)
})

test('keeps rejecting from cache, then recounts and lets the user back in', async () => {
  const { pg, one } = pgCounting(CAP, 10)
  await expect(assertUnderUnfilledApiOrderCap(pg, 'u', 0)).rejects.toThrow()
  await expect(
    assertUnderUnfilledApiOrderCap(pg, 'u', UNFILLED_API_ORDER_RECOUNT_MS - 1)
  ).rejects.toThrow()
  expect(one).toHaveBeenCalledTimes(1)
  await assertUnderUnfilledApiOrderCap(pg, 'u', UNFILLED_API_ORDER_RECOUNT_MS)
  expect(one).toHaveBeenCalledTimes(2)
})

test('counts each user separately', async () => {
  const { pg } = pgCounting(CAP, 0)
  await expect(assertUnderUnfilledApiOrderCap(pg, 'bot', 0)).rejects.toThrow()
  await assertUnderUnfilledApiOrderCap(pg, 'human', 0)
})

test('concurrent requests from one user share one count', async () => {
  const { pg, one } = pgCounting(CAP)
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => assertUnderUnfilledApiOrderCap(pg, 'u', 0))
  )
  expect(one).toHaveBeenCalledTimes(1)
  expect(results.every((r) => r.status === 'rejected')).toBe(true)
})

test('a failed count is not cached', async () => {
  const one = jest
    .fn()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockImplementationOnce((_q, _v, map) => Promise.resolve(map({ n: 0 })))
  const pg = { one } as unknown as SupabaseDirectClient
  await expect(assertUnderUnfilledApiOrderCap(pg, 'u', 0)).rejects.toThrow(
    'timeout'
  )
  await assertUnderUnfilledApiOrderCap(pg, 'u', 1)
  expect(one).toHaveBeenCalledTimes(2)
})
