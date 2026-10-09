// Pixel layout for the seat bar: segments proportional to their seats, but
// every non-zero segment at least `min` px wide (the width comes from the
// larger segments), with `gap` px of surface between segments. The result
// always spans exactly `width`.

export type SegmentBox = { x: number; w: number }

export function layoutSegments(
  counts: number[],
  width: number,
  { min = 6, gap = 2 }: { min?: number; gap?: number } = {}
): SegmentBox[] {
  const n = counts.length
  if (!n || !Number.isFinite(width) || width <= 0) return []
  const total = counts.reduce((a, b) => a + Math.max(0, b), 0)
  const available = Math.max(0, width - gap * (n - 1))
  const floor = Math.min(min, available / n)
  const widths = counts.map((c) =>
    total > 0 ? (available * Math.max(0, c)) / total : available / n
  )
  // Raise thin segments to the floor and take the difference from the
  // others in proportion to how far each is above the floor.
  for (let pass = 0; pass < n; pass++) {
    const deficit = widths.reduce(
      (sum, w) => sum + (w < floor ? floor - w : 0),
      0
    )
    if (deficit < 1e-9) break
    const spare = widths.reduce(
      (sum, w) => sum + (w > floor ? w - floor : 0),
      0
    )
    for (let i = 0; i < n; i++)
      widths[i] =
        widths[i] < floor
          ? floor
          : widths[i] - (deficit * (widths[i] - floor)) / spare
  }
  let x = 0
  return widths.map((w) => {
    const box = { x, w }
    x += w + gap
    return box
  })
}

// Where a seat count falls on the laid-out bar (e.g. the majority line at
// 218 of 435), interpolated within the segment that contains it.
export function seatPosition(
  counts: number[],
  boxes: SegmentBox[],
  seat: number
): number | undefined {
  if (!boxes.length) return undefined
  let before = 0
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i]
    if (seat <= before + count) {
      const into = count > 0 ? (seat - before) / count : 0
      return boxes[i].x + boxes[i].w * into
    }
    before += count
  }
  const last = boxes[boxes.length - 1]
  return last.x + last.w
}

// Click/tap targets: each covers its own segment and grows to `min` px
// around thin ones, but neighbors split the space between their centers, so
// two thin segments side by side never steal each other's taps.
export function hitTargets(
  boxes: SegmentBox[],
  width: number,
  min = 24
): { left: number; width: number }[] {
  const centers = boxes.map((b) => b.x + b.w / 2)
  return boxes.map((b, i) => {
    const half = Math.max(b.w, min) / 2
    const c = centers[i]
    // How far this target may reach before a neighbor's half begins.
    const floor = i > 0 ? Math.min(b.x, (centers[i - 1] + c) / 2) : 0
    const ceiling =
      i < boxes.length - 1
        ? Math.max(b.x + b.w, (c + centers[i + 1]) / 2)
        : width
    let lo = c - half
    let hi = c + half
    // At the ends of the bar, slide inward instead of shrinking.
    if (hi > width) [lo, hi] = [lo - (hi - width), width]
    if (lo < 0) [lo, hi] = [0, hi - lo]
    lo = Math.max(lo, floor, 0)
    hi = Math.min(hi, ceiling, width)
    return { left: lo, width: Math.max(0, hi - lo) }
  })
}

// The segment a drag is over at `x`: the eligible target containing it (the
// narrowest, as thin targets sit on top), else the nearest eligible one, so
// held seats and the space past either end clamp to the closest group.
export function segmentAt(
  targets: { left: number; width: number }[],
  x: number,
  eligible: (i: number) => boolean = () => true
): number | undefined {
  if (!Number.isFinite(x)) return undefined
  let best: { i: number; distance: number; width: number } | undefined
  targets.forEach((t, i) => {
    if (!eligible(i)) return
    const right = t.left + t.width
    const distance = x < t.left ? t.left - x : x > right ? x - right : 0
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && distance === 0 && t.width < best.width)
    )
      best = { i, distance, width: t.width }
  })
  return best?.i
}
