import { isUncachedQuoteRead } from './cache'

it('bypasses caches for open orders without changing historical bets', () => {
  expect(isUncachedQuoteRead('bets', { kinds: 'open-limit' })).toBe(true)
  expect(isUncachedQuoteRead('bets', { contractId: 'market' })).toBe(false)
  expect(isUncachedQuoteRead('unrelated', { kinds: 'open-limit' })).toBe(false)
})
