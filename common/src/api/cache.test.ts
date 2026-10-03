import { isUncachedQuoteRead } from './cache'

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
