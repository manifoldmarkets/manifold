import { APIError } from 'common/api/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  MAX_UNFILLED_API_ORDERS_PER_DAY,
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
  const { pg, one } = pgCounting(MAX_UNFILLED_API_ORDERS_PER_DAY - 1)
  await assertUnderUnfilledApiOrderCap(pg, 'u', 0)
  await assertUnderUnfilledApiOrderCap(pg, 'u', 1000)
  expect(one).toHaveBeenCalledTimes(1)
  expect(one.mock.calls[0][1]).toEqual(['u', MAX_UNFILLED_API_ORDERS_PER_DAY])
})

test('rejects a user at the cap with a 429', async () => {
  const { pg } = pgCounting(MAX_UNFILLED_API_ORDERS_PER_DAY)
  const error = await assertUnderUnfilledApiOrderCap(pg, 'u', 0).catch((e) => e)
  expect(error).toBeInstanceOf(APIError)
  expect(error.code).toBe(429)
})

test('keeps rejecting from cache, then recounts and lets the user back in', async () => {
  const { pg, one } = pgCounting(MAX_UNFILLED_API_ORDERS_PER_DAY, 10)
  await expect(assertUnderUnfilledApiOrderCap(pg, 'u', 0)).rejects.toThrow()
  await expect(
    assertUnderUnfilledApiOrderCap(pg, 'u', UNFILLED_API_ORDER_RECOUNT_MS - 1)
  ).rejects.toThrow()
  expect(one).toHaveBeenCalledTimes(1)
  await assertUnderUnfilledApiOrderCap(pg, 'u', UNFILLED_API_ORDER_RECOUNT_MS)
  expect(one).toHaveBeenCalledTimes(2)
})

test('counts each user separately', async () => {
  const { pg } = pgCounting(MAX_UNFILLED_API_ORDERS_PER_DAY, 0)
  await expect(assertUnderUnfilledApiOrderCap(pg, 'bot', 0)).rejects.toThrow()
  await assertUnderUnfilledApiOrderCap(pg, 'human', 0)
})
