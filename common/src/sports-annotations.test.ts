import {
  findMoveOnset,
  estimateGoalWallClock,
  MoveBet,
} from './sports-annotations'

// Real downsampled France-answer displayed-prob curve from the World Cup '26
// FRA–SEN market (contract znPcl6qh5L, France won 3–1), pulled from prod, 5s
// buckets across 20:20–20:50 UTC. Two real goals show as sustained steps
// (~1781641780000 and ~1781642745000); a transient at ~1781641425000
// (0.49→0.72→0.49) is a big order arbed back, NOT a goal.
const FRA: [number, number][] = [
  [1781641240000, 0.4631], [1781641260000, 0.4648], [1781641315000, 0.48],
  [1781641320000, 0.51], [1781641325000, 0.54], [1781641330000, 0.55],
  [1781641335000, 0.56], [1781641340000, 0.56], [1781641355000, 0.54],
  [1781641360000, 0.53], [1781641365000, 0.49], [1781641380000, 0.5819],
  [1781641385000, 0.68], [1781641390000, 0.64], [1781641395000, 0.5577],
  [1781641400000, 0.57], [1781641405000, 0.6045], [1781641410000, 0.6086],
  [1781641420000, 0.69], [1781641425000, 0.72], [1781641430000, 0.72],
  [1781641435000, 0.72], [1781641440000, 0.7], [1781641445000, 0.7],
  [1781641450000, 0.71], [1781641465000, 0.7], [1781641475000, 0.67],
  [1781641480000, 0.71], [1781641485000, 0.59], [1781641490000, 0.52],
  [1781641495000, 0.49], [1781641530000, 0.47], [1781641540000, 0.4731],
  [1781641560000, 0.46], [1781641585000, 0.45], [1781641720000, 0.4308],
  [1781641745000, 0.4346], [1781641780000, 0.65], [1781641785000, 0.79],
  [1781641800000, 0.7889], [1781641805000, 0.8], [1781641810000, 0.81],
  [1781641815000, 0.829], [1781641820000, 0.8262], [1781641830000, 0.8346],
  [1781641840000, 0.8401], [1781641845000, 0.84], [1781641850000, 0.8364],
  [1781641860000, 0.84], [1781641870000, 0.8436], [1781641890000, 0.5703],
  [1781641895000, 0.63], [1781641900000, 0.78], [1781641905000, 0.73],
  [1781641910000, 0.7762], [1781641915000, 0.79], [1781641920000, 0.7825],
  [1781641925000, 0.79], [1781641930000, 0.79], [1781641940000, 0.79],
  [1781641945000, 0.78], [1781641950000, 0.7945], [1781641955000, 0.8151],
  [1781641960000, 0.79], [1781641965000, 0.8088], [1781641970000, 0.8184],
  [1781641980000, 0.81], [1781641985000, 0.8197], [1781642005000, 0.81],
  [1781642020000, 0.82], [1781642085000, 0.8228], [1781642150000, 0.8218],
  [1781642155000, 0.8228], [1781642180000, 0.815], [1781642195000, 0.8177],
  [1781642205000, 0.8148], [1781642210000, 0.81], [1781642220000, 0.8],
  [1781642265000, 0.81], [1781642270000, 0.8149], [1781642340000, 0.8216],
  [1781642385000, 0.8248], [1781642400000, 0.8369], [1781642410000, 0.8288],
  [1781642420000, 0.8289], [1781642430000, 0.8281], [1781642500000, 0.8365],
  [1781642510000, 0.8365], [1781642570000, 0.8383], [1781642590000, 0.8436],
  [1781642725000, 0.84], [1781642745000, 0.87], [1781642750000, 0.95],
  [1781642755000, 0.9562], [1781642765000, 0.9711], [1781642775000, 0.9734],
  [1781642795000, 0.99], [1781642810000, 0.99], [1781642835000, 0.99],
  [1781642855000, 0.99], [1781642900000, 0.9909],
]

const bets: MoveBet[] = FRA.map(([createdTime, probAfter]) => ({
  createdTime,
  probAfter,
}))

describe('findMoveOnset (real FRA–SEN World Cup data)', () => {
  test('snaps a goal marker to the FOOT of the spike, well before detection', () => {
    // Provider poll detects France 1–0 ~50s after the market actually moved.
    const detectedTime = 1781641830000
    const move = findMoveOnset(bets, { detectedTime, direction: 1 })

    expect(move).not.toBeNull()
    // The visible rise begins ~1781641770–785000 (0.43→0.65→0.79). Marker must
    // land in the rise's foot, not at the detection time.
    expect(move!.eventTime).toBeGreaterThanOrEqual(1781641760000)
    expect(move!.eventTime).toBeLessThanOrEqual(1781641800000)
    // Back-dated meaningfully before we received the signal.
    expect(detectedTime - move!.eventTime).toBeGreaterThan(25_000)
    expect(move!.probChange).toBeGreaterThan(0.25)
  })

  test('snaps the second goal to its own spike', () => {
    const detectedTime = 1781642800000
    const move = findMoveOnset(bets, { detectedTime, direction: 1 })

    expect(move).not.toBeNull()
    expect(move!.eventTime).toBeGreaterThanOrEqual(1781642730000)
    expect(move!.eventTime).toBeLessThanOrEqual(1781642760000)
  })

  test('does NOT place a marker on the transient blip that reverted', () => {
    // A poll a few minutes in with no real goal: the 20:23 spike fully reverted,
    // so the standing level is back at baseline — nothing to snap to.
    const detectedTime = 1781641560000
    const move = findMoveOnset(bets, { detectedTime, direction: 1 })
    expect(move).toBeNull()
  })

  test('a VAR reversal (direction -1) finds the sustained DROP', () => {
    // Synthetic: France prob holds ~0.80 then drops to ~0.55 and stays (goal
    // disallowed). Onset should land at the foot of the drop.
    const drop: MoveBet[] = [
      [0, 0.8], [10_000, 0.8], [20_000, 0.8], [30_000, 0.8],
      [40_000, 0.55], [50_000, 0.54], [60_000, 0.55], [70_000, 0.55],
    ].map(([t, p]) => ({ createdTime: t, probAfter: p }))
    const move = findMoveOnset(drop, { detectedTime: 70_000, direction: -1 })
    expect(move).not.toBeNull()
    expect(move!.eventTime).toBeGreaterThanOrEqual(30_000)
    expect(move!.eventTime).toBeLessThanOrEqual(45_000)
    expect(move!.probChange).toBeLessThan(0) // France prob fell
  })

  test('returns null when there is no bet activity at all', () => {
    expect(
      findMoveOnset([], { detectedTime: 1781641830000, direction: 1 })
    ).toBeNull()
  })
})

// More finished World Cup '26 games, real compressed displayed-prob curves from
// prod (10s buckets, change-points only; findMoveOnset forward-fills). These
// runtime-confirm the two headline behaviors across games: clean goals snap to
// the spike foot, and goals scored while a team is already heavily favored
// (no visible move) correctly fall back instead of snapping to noise.
describe('findMoveOnset (more real games)', () => {
  // ARG 3–0 ALG — Argentina answer (home, 3 goals). kickoff 2026-06-17T01:00Z.
  const ARG: [number, number][] = [
    [1781658280000, 0.63], [1781658440000, 0.75], [1781658450000, 0.63],
    [1781658460000, 0.67], [1781658500000, 0.658], [1781658540000, 0.67],
    [1781658600000, 0.63], [1781658610000, 0.56], [1781658630000, 0.48],
    [1781658640000, 0.52], [1781658650000, 0.54], [1781658660000, 0.66],
    [1781658680000, 0.64], [1781658690000, 0.65], [1781658850000, 0.63],
    [1781658870000, 0.65], [1781659150000, 0.834], [1781659160000, 0.846],
    [1781659170000, 0.82], [1781659220000, 0.837], [1781659270000, 0.8],
    [1781659740000, 0.815], [1781659750000, 0.833], [1781659970000, 0.81],
    [1781659980000, 0.82], [1781660030000, 0.839], [1781660040000, 0.82],
    [1781660120000, 0.83], [1781660360000, 0.817], [1781660440000, 0.84],
    [1781660450000, 0.83], [1781660460000, 0.842], [1781660620000, 0.83],
    [1781662510000, 0.83], [1781662640000, 0.846], [1781662980000, 0.93],
    [1781662990000, 0.946], [1781663000000, 0.958], [1781663150000, 0.96],
    [1781663410000, 0.99],
  ]
  const argBets: MoveBet[] = ARG.map(([createdTime, probAfter]) => ({
    createdTime,
    probAfter,
  }))

  test('ARG goal 1 (1–0) snaps to its spike', () => {
    const m = findMoveOnset(argBets, { detectedTime: 1781659230000, direction: 1 })
    expect(m).not.toBeNull()
    expect(m!.eventTime).toBeGreaterThanOrEqual(1781659120000)
    expect(m!.eventTime).toBeLessThanOrEqual(1781659180000)
  })

  test('ARG goal 2 (2–0) snaps to its spike', () => {
    const m = findMoveOnset(argBets, { detectedTime: 1781663070000, direction: 1 })
    expect(m).not.toBeNull()
    expect(m!.eventTime).toBeGreaterThanOrEqual(1781662950000)
    expect(m!.eventTime).toBeLessThanOrEqual(1781663010000)
  })

  test('ARG goal 3 (3–0) is already priced in (+0.03) → falls back, no false snap', () => {
    const m = findMoveOnset(argBets, { detectedTime: 1781663490000, direction: 1 })
    expect(m).toBeNull()
  })

  // IRQ 1–4 NOR — Norway answer (away favorite). kickoff 2026-06-16T22:00Z.
  const NOR: [number, number][] = [
    [1781648640000, 0.74], [1781648650000, 0.73], [1781648700000, 0.746],
    [1781648790000, 0.73], [1781648950000, 0.81], [1781648960000, 0.83],
    [1781648990000, 0.88], [1781649020000, 0.905], [1781649060000, 0.892],
  ]
  const norBets: MoveBet[] = NOR.map(([createdTime, probAfter]) => ({
    createdTime,
    probAfter,
  }))

  test('NOR opener (away goal, away favorite) snaps to its spike', () => {
    const m = findMoveOnset(norBets, { detectedTime: 1781649030000, direction: 1 })
    expect(m).not.toBeNull()
    expect(m!.eventTime).toBeGreaterThanOrEqual(1781648900000)
    expect(m!.eventTime).toBeLessThanOrEqual(1781648970000)
  })
})

describe('estimateGoalWallClock (fallback)', () => {
  const kickoff = 1_000_000_000_000
  test("maps a first-half minute to kickoff + minute", () => {
    const detected = kickoff + 30 * 60_000
    expect(estimateGoalWallClock(kickoff, 20, detected)).toBe(
      kickoff + 20 * 60_000
    )
  })

  test('adds the half-time break for second-half minutes', () => {
    // A 60' goal happens ~75 min of wall-clock after kickoff (60 played + the
    // ~15 min half-time break); detection lands a few seconds later.
    const detected = kickoff + 76 * 60_000
    expect(estimateGoalWallClock(kickoff, 60, detected)).toBe(
      kickoff + 60 * 60_000 + 15 * 60_000
    )
  })

  test('falls back to detection time when the minute is missing', () => {
    const detected = kickoff + 30 * 60_000
    expect(estimateGoalWallClock(kickoff, null, detected)).toBe(detected)
    expect(estimateGoalWallClock(kickoff, 'HT', detected)).toBe(detected)
  })

  test('never returns a time after detection', () => {
    const detected = kickoff + 10 * 60_000
    // Minute says 80' but we only detected 10' in (clock desync) → clamp.
    expect(estimateGoalWallClock(kickoff, 80, detected)).toBe(detected)
  })
})
