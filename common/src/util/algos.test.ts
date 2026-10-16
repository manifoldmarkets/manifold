import { BINARY_SEARCH_NAN_ERROR, binarySearch, findRoot } from './algos'

describe('findRoot', () => {
  const counted = (f: (x: number) => number) => {
    let calls = 0
    return {
      f: (x: number) => {
        calls++
        return f(x)
      },
      calls: () => calls,
    }
  }

  it('finds the root of a smooth function to float precision in a few calls', () => {
    const { f, calls } = counted((x) => Math.log1p(x) - 3)
    const root = findRoot(0, 1000, f)
    expect(root).toBeCloseTo(Math.expm1(3), 12)
    expect(calls()).toBeLessThan(25)
    // Where bisection takes 50.
    const bisected = counted((x) => Math.log1p(x) - 3)
    binarySearch(0, 1000, bisected.f)
    expect(bisected.calls()).toBeGreaterThanOrEqual(50)
  })

  it('handles a very flat or very steep function', () => {
    expect(findRoot(0, 1, (x) => x ** 9 - 1e-9)).toBeCloseTo(
      Math.pow(1e-9, 1 / 9),
      12
    )
    expect(findRoot(0, 1e6, (x) => Math.exp(x / 1000) - 2)).toBeCloseTo(
      1000 * Math.LN2,
      9
    )
  })

  it('converges on a comparator that jumps past the root', () => {
    // Like the basket solve's, which reads 1 wherever the answers can't sum to 1.
    const { f, calls } = counted((x) => (x < 0.7 ? x - 0.9 : 1))
    const edge = findRoot(0, 1, f)
    expect(edge).toBeLessThan(0.7)
    expect(0.7 - edge).toBeLessThan(1e-12)
    expect(calls()).toBeLessThan(120)
  })

  it('returns the highest point found below the root', () => {
    const root = findRoot(0, 10, (x) => x * x - 2)
    expect(root * root - 2).toBeLessThanOrEqual(0)
    expect(root).toBeCloseTo(Math.SQRT2, 14)
  })

  it('returns an end when the root is at or past it', () => {
    expect(findRoot(1, 2, (x) => x - 0.5)).toBe(1)
    expect(findRoot(1, 2, (x) => x - 1)).toBe(1)
    expect(findRoot(1, 2, (x) => x - 3)).toBe(2)
    expect(findRoot(1, 2, (x) => x - 1.5)).toBe(1.5)
  })

  it('fails recognizably on a NaN comparator', () => {
    expect(() => findRoot(0, 1, (x) => (x > 0.3 ? NaN : -1))).toThrow(
      BINARY_SEARCH_NAN_ERROR
    )
  })
})
