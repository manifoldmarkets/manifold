// Prefix of the error binarySearch throws when its comparator returns NaN.
export const BINARY_SEARCH_NAN_ERROR = 'binarySearch: comparator returned NaN'

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
        BINARY_SEARCH_NAN_ERROR + ' at ' + JSON.stringify({ min, max, mid, i })
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

// The point where `comparator`, increasing on [min, max], crosses 0: like
// binarySearch, but by regula falsi with the Anderson–Björck fix, which reaches
// float precision on a smooth comparator in about a dozen calls where bisection
// takes 50. Where four steps in a row haven't halved the bracket, the next is a
// bisection, so a comparator with a jump in it still converges, at about
// bisection's pace.
// Returns a point where the comparator is 0, or else the highest point found
// where it's below 0 (min if it's 0 or above there, max if it's below 0 there).
export function findRoot(
  min: number,
  max: number,
  comparator: (x: number) => number,
  maxIterations = 200
) {
  const evaluate = (x: number) => {
    const value = comparator(x)
    if (isNaN(value))
      throw new Error(
        BINARY_SEARCH_NAN_ERROR + ' at ' + JSON.stringify({ min, max, x })
      )
    return value
  }
  let [lo, flo] = [min, evaluate(min)]
  if (flo >= 0) return min
  let [hi, fhi] = [max, evaluate(max)]
  if (fhi <= 0) return max
  // -1 or 1 as the last step moved lo or hi.
  let lastMoved = 0
  const widths: number[] = []
  for (let i = 0; i < maxIterations; i++) {
    const width = hi - lo
    let x = hi - (fhi * width) / (fhi - flo)
    if (width > widths[i - 4] / 2 || !(x > lo && x < hi)) x = lo + width / 2
    if (!(x > lo && x < hi)) break
    const value = evaluate(x)
    if (value === 0) return x
    // When the same end moves twice running, scale the other end's value down
    // so the next step lands on its side of the root.
    const scale = (was: number) => {
      const m = 1 - value / was
      return m > 0 ? m : 0.5
    }
    if (value < 0) {
      if (lastMoved === -1) fhi *= scale(flo)
      ;[lo, flo] = [x, value]
      lastMoved = -1
    } else {
      if (lastMoved === 1) flo *= scale(fhi)
      ;[hi, fhi] = [x, value]
      lastMoved = 1
    }
    widths.push(width)
  }
  return lo
}
