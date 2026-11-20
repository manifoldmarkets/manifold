import { formatSportsPrice } from './sports-price'

it.each([
  [0, '<1%'],
  [0.006, '<1%'],
  [0.01, '1%'],
  [0.497, '50%'],
  [0.99, '99%'],
  [0.994, '>99%'],
  [1, '>99%'],
  [-1, '—'],
  [2, '—'],
  [NaN, '—'],
  [Infinity, '—'],
])('formats the sports market price %s as %s', (probability, expected) => {
  expect(formatSportsPrice(Number(probability))).toBe(expected)
})
