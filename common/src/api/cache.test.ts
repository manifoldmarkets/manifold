import { isUncachedQuoteRead } from './cache'

it('bypasses caches for open orders without changing historical bets', () => {
  expect(isUncachedQuoteRead('bets', { kinds: 'open-limit' })).toBe(true)
  expect(isUncachedQuoteRead('bets', { contractId: 'market' })).toBe(false)
  expect(isUncachedQuoteRead('unrelated', { kinds: 'open-limit' })).toBe(false)
  expect(isUncachedQuoteRead('markets-by-ids', { ids: ['market'] })).toBe(true)
  expect(isUncachedQuoteRead('users/by-id/balance', { ids: ['maker'] })).toBe(
    true
  )
})
