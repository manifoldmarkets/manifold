import { sortBy, sum } from 'lodash'

export const logInterpolation = (min: number, max: number, value: number) => {
  if (value <= min) return 0
  if (value >= max) return 1

  return Math.log(value - min + 1) / Math.log(max - min + 1)
}

export const logit = (x: number) => Math.log(x / (1 - x))

export function normpdf(x: number, mean = 0, variance = 1) {
  if (variance === 0) {
    return x === mean ? Infinity : 0
  }

  return (
    Math.exp((-0.5 * Math.pow(x - mean, 2)) / variance) /
    Math.sqrt(TAU * variance)
  )
}

export const TAU = Math.PI * 2

export function median(xs: number[]) {
  if (xs.length === 0) return NaN

  const sorted = sortBy(xs, (x) => x)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export function average(xs: number[]) {
  return sum(xs) / xs.length
}

export const EPSILON = 0.00000001

export function floatingEqual(a: number, b: number, epsilon = EPSILON) {
  return Math.abs(a - b) < epsilon
}

export function floatingGreaterEqual(a: number, b: number, epsilon = EPSILON) {
  return a + epsilon >= b
}

export function floatingLesserEqual(a: number, b: number, epsilon = EPSILON) {
  return a - epsilon <= b
}
