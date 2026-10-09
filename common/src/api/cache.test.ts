import { DEFAULT_CACHE_STRATEGY, LIGHT_CACHE_STRATEGY } from './schema'
import { isUncachedQuoteRead, maxCachedAgeMs } from './cache'

it('bypasses caches only for quote reads that ask for fresh data', () => {
  const fresh = { fresh: true }
  // Query strings reach the server's header check unparsed.
  const freshQuery = { fresh: 'true' }
  expect(isUncachedQuoteRead('bets', { kinds: 'open-limit', ...fresh })).toBe(
    true
  )
  expect(
    isUncachedQuoteRead('bets', { kinds: 'open-limit', ...freshQuery })
  ).toBe(true)
  expect(isUncachedQuoteRead('markets-by-ids', { ids: ['m'], ...fresh })).toBe(
    true
  )
  expect(
    isUncachedQuoteRead('users/by-id/balance', { ids: ['u'], ...freshQuery })
  ).toBe(true)

  // Cards, tables, the perps poll and API clients keep normal caching.
  expect(isUncachedQuoteRead('bets', { kinds: 'open-limit' })).toBe(false)
  expect(isUncachedQuoteRead('markets-by-ids', { ids: ['m'] })).toBe(false)
  expect(isUncachedQuoteRead('users/by-id/balance', { ids: ['u'] })).toBe(false)
  expect(
    isUncachedQuoteRead('markets-by-ids', { ids: ['m'], fresh: 'false' })
  ).toBe(false)
  // Only open orders are quote inputs; bet history stays cacheable.
  expect(isUncachedQuoteRead('bets', { contractId: 'm', ...fresh })).toBe(false)
  expect(isUncachedQuoteRead('unrelated', fresh)).toBe(false)
})

it('bounds how far a cached response can lag the origin', () => {
  // max-age=5 plus stale-while-revalidate=10, and a second for rounding.
  expect(maxCachedAgeMs(DEFAULT_CACHE_STRATEGY)).toBe(16_000)
  expect(maxCachedAgeMs(LIGHT_CACHE_STRATEGY)).toBe(2_000)
  expect(maxCachedAgeMs('no-cache')).toBe(0)
  expect(maxCachedAgeMs(undefined)).toBe(0)
})
