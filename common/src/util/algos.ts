export function binarySearch(
  min: number,
  max: number,
  comparator: (x: number) => number,
  maxIterations = 50
) {
  let mid = 0
  let i = 0
  while (true) {
    mid = min + (max - min) / 2

    // Break once we've reached max precision.
    if (mid === min || mid === max) break

    const comparison = comparator(mid)
    // NaN compares false with everything, so it would silently take the else branch
    // and walk min up to a corner — returning a plausible-looking wrong answer.
    // A NaN objective is always a caller bug: fail fast instead.
    if (isNaN(comparison)) {
      throw new Error(
        'binarySearch: comparator returned NaN at ' +
          JSON.stringify({ min, max, mid, i })
      )
    }
    if (comparison === 0) break
    else if (comparison > 0) {
      max = mid
    } else {
      min = mid
    }

    i++
    if (i >= maxIterations) {
      break
    }
    if (i > 100000) {
      throw new Error(
        'Binary search exceeded max iterations' +
          JSON.stringify({ min, max, mid, i }, null, 2)
      )
    }
  }
  return mid
}
