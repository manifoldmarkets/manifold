// ─── Sports goal-annotation placement ────────────────────────────────────────
//
// football-data.org tells us a goal happened (the cumulative score ticked up
// between two ~10s polls) but NOT the wall-clock instant it happened. The poll
// itself lands seconds-to-tens-of-seconds after the goal, so placing a chart
// marker at the moment we *received* the signal parks it AFTER the visible
// probability spike — which looks broken.
//
// The fix is signal fusion: the score delta tells us *that* a goal happened and
// roughly *when* (the detection time); the market's own reaction tells us
// *exactly where on the chart* to put the marker. The chart's x-axis is bet
// `createdTime`, and live-watching traders/bots react before our poll, so the
// true moment is already in the bet stream. We back-date the marker onto the
// onset of that move.
//
// Two things real World Cup bet data (FRA–SEN, 2026-06-16) taught us, both
// baked into the algorithm below:
//
//  1. Detect on the DISPLAYED probability curve (the latest bet's probAfter over
//     time — what the chart actually draws), NOT on summed per-bet deltas. A
//     single logical trade in a CPMM-multi sums-to-one market emits several bet
//     rows that ping-pong (e.g. France 0.509→0.749 then immediately 0.749→0.532
//     as sibling answers refill). Per-bet deltas net to ~zero and would both
//     miss real goals and fire on noise.
//
//  2. A goal is a step that PERSISTS, not merely a spike. France's curve has a
//     transient at 20:23 (0.49→0.72→0.49, fully reverted within a minute — a big
//     market order arbed back) and a real goal at 20:29 (0.44→0.79→0.84 and it
//     holds). We already KNOW a goal occurred (the score delta), so we anchor on
//     the elevated standing level at detection time and walk back to where that
//     sustained rise began — which lands on 20:29 and ignores the 20:23 blip.
//
// Everything here is pure (operates on a plain bet array, no DB) so the poller,
// the offline backtest, and unit tests can all share it.

// Minimal bet shape this module needs. Compatible with common `Bet`.
export type MoveBet = {
  createdTime: number
  probAfter: number
  isRedemption?: boolean
}

export type GoalMove = {
  // Timestamp (ms) to place the annotation at — the onset of the sustained move.
  eventTime: number
  // Signed change in the scoring answer's displayed probability across the move,
  // clamped to [-1, 1]. Positive = the answer rose (a goal for that team).
  probChange: number
}

export type FindMoveOptions = {
  // When the poll observed the score change (ms). The move happened at or before
  // this; we never place a marker after it.
  detectedTime: number
  // +1 when the scoring answer should move UP (a goal for that team), -1 when it
  // should move DOWN (a VAR reversal of that team's goal).
  direction: 1 | -1
  // How far back from detectedTime to hunt for the move. Default 3 min — covers
  // poll lag plus a slow-reacting market without reaching into an unrelated
  // earlier swing.
  lookbackMs?: number
  // The displayed prob must move at least this much (in the goal's direction),
  // from its pre-goal plateau to its standing level at detection, to count. Below
  // this there's no spike worth snapping to and the caller should fall back.
  minMove?: number
  // Window just before detection used to measure the *standing* post-goal level
  // (a short median, so one transient tick doesn't define it). Default 40s.
  sustainMs?: number
  // Curve is sampled into buckets this wide (last prob in each, forward-filled),
  // smoothing the intra-second ping-pong. Default 15s.
  bucketMs?: number
}

// Find the onset of the probability move a confirmed goal (or its reversal)
// caused, by reading the scoring answer's recent displayed-prob curve. Returns
// null when the market didn't visibly/sustainedly react — the caller then falls
// back to a coarser estimate.
export function findMoveOnset(
  bets: MoveBet[],
  opts: FindMoveOptions
): GoalMove | null {
  const {
    detectedTime,
    direction,
    lookbackMs = 180_000,
    minMove = 0.05,
    sustainMs = 40_000,
    bucketMs = 15_000,
  } = opts

  const windowStart = detectedTime - lookbackMs

  // Displayed curve = probAfter of real bets over time (redemptions don't reflect
  // a trader's view change). Orient by direction so a goal is always an *upward*
  // move in v, letting one code path handle goals and VAR reversals alike.
  const points = bets
    .filter((b) => !b.isRedemption && b.createdTime <= detectedTime)
    .sort((a, b) => a.createdTime - b.createdTime)
    .map((b) => ({ t: b.createdTime, v: b.probAfter * direction }))

  if (points.length === 0) return null

  // Bucket the curve (last value per bucket) and forward-fill, so sparse gaps and
  // intra-second ping-pong both collapse to a clean step series. Seed the fill
  // with the last value at/before the window so we have a baseline from the start.
  const firstBucket = Math.floor(windowStart / bucketMs)
  const lastBucket = Math.floor(detectedTime / bucketMs)
  let fill = points[0].v
  for (const p of points) {
    if (p.t >= windowStart) break
    fill = p.v
  }
  let pi = 0
  const series: { t: number; v: number }[] = []
  for (let b = firstBucket; b <= lastBucket; b++) {
    const bucketEnd = (b + 1) * bucketMs
    while (pi < points.length && points[pi].t < bucketEnd) {
      if (points[pi].t >= windowStart) fill = points[pi].v
      pi++
    }
    series.push({ t: b * bucketMs, v: fill })
  }
  if (series.length === 0) return null

  // Standing post-goal level: median of the buckets within sustainMs of detection
  // (median shrugs off a lone transient tick).
  const recent = series
    .filter((s) => s.t >= detectedTime - sustainMs)
    .map((s) => s.v)
    .sort((a, b) => a - b)
  const standing = recent.length
    ? recent[Math.floor(recent.length / 2)]
    : series[series.length - 1].v
  const base = Math.min(...series.map((s) => s.v))

  // No sustained move in the goal's direction → nothing to snap to.
  if (standing - base < minMove) return null

  // The marker should sit at the FOOT of the rise, not its peak. Walk back from
  // detection over the contiguous run that stays above the rise's midpoint; the
  // onset is the first bucket of that run — where the climb began. Anchoring on
  // the midpoint (not a near-standing threshold) also stops us snapping onto an
  // earlier transient blip: the walk halts at the trough that precedes the real
  // sustained step.
  const mid = base + (standing - base) * 0.5
  let onsetIdx = series.length - 1
  while (onsetIdx > 0 && series[onsetIdx - 1].v >= mid) onsetIdx--
  const onset = series[onsetIdx]
  const preOnsetV = series[Math.max(0, onsetIdx - 1)].v

  return {
    eventTime: onset.t,
    // Re-sign back to the answer's actual probability change.
    probChange: Math.max(-1, Math.min(1, (standing - preOnsetV) * direction)),
  }
}

// Fallback placement when the market didn't visibly react (findMoveOnset
// returned null): estimate wall-clock from the match minute the provider
// reported. Coarse (minute resolution, and the minute is itself lagged) so this
// is only a backstop — in a market with no spike there's nothing to misalign
// against anyway. Always bounded to the recent past, never after detection.
const HALFTIME_BREAK_MS = 15 * 60 * 1000

export function estimateGoalWallClock(
  kickoffMs: number,
  minute: number | string | null | undefined,
  detectedTime: number
): number {
  const m = typeof minute === 'string' ? parseInt(minute, 10) : minute
  if (m == null || !isFinite(m as number) || (m as number) <= 0) {
    return detectedTime
  }
  // Add the half-time break once the clock is into the second half.
  const breakMs = (m as number) > 45 ? HALFTIME_BREAK_MS : 0
  const est = kickoffMs + (m as number) * 60_000 + breakMs
  // The goal can't be in the future relative to when we saw it, and shouldn't be
  // implausibly far before it either.
  return Math.min(detectedTime, Math.max(detectedTime - 10 * 60_000, est))
}
