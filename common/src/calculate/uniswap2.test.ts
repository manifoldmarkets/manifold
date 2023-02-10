import { afterSwap } from './uniswap2'

test('adds 10 M$ to the pool ', () => {
  const pool = { M$: 500, SHARE: 500 }
  const result = afterSwap(pool, 'M$', 10)
  expect(result.M$).toBe(510)
  expect(result.SHARE).toBe(490.19607843137254)
})

test('removes all M$ from pool', () => {
  const pool = { M$: 500, SHARE: 500 }
  expect(() => afterSwap(pool, 'M$', -500)).toThrow(Error)
})
