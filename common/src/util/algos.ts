export function binarySearch(
  min: number,
  max: number,
  comparator: (x: number) => number
) {
  let mid = 0
  while (true) {
    mid = min + (max - min) / 2

    // Break once we've reached max precision.
    if (mid === min || mid === max) break

    const comparison = comparator(mid)
    if (comparison === 0) break
    else if (comparison > 0) {
      max = mid
    } else {
      min = mid
    }
  }
  return mid
}
