import {
  ApprovalPoll,
  PublishedAverageSeries,
  TRUMP_APPROVAL_HEARTBEAT_MS,
  TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP,
  TRUMP_APPROVAL_MAX_WINDOW_DAYS,
  TRUMP_APPROVAL_MIN_POLLS,
  averageApprovalPct,
  computeApprovalPoint,
  decideApprovalPublish,
  getApprovalCrossCheckGap,
  hasApproveAnswer,
  isUsableApprovalPoll,
  readApprovePct,
  readPublishedApprovalAverage,
  readPublishedApprovalSeries,
  selectApprovalWindow,
} from './trump-approval'

const poll = (
  endDate: string,
  pct: number,
  pollster = 'Pollster'
): ApprovalPoll => ({ endDate, pct, pollster })

const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)

/** `count` polls all ending on `endDate`, at a constant pct. */
const cluster = (endDate: string, count: number, pct: number) =>
  Array.from({ length: count }, (_, i) => poll(endDate, pct, `Pollster${i}`))

/** One poll per day for `count` days, ending on `endDate`. */
const daily = (endDate: string, count: number, pct: number) =>
  Array.from({ length: count }, (_, i) => poll(shift(endDate, -i), pct))

// The polls that were actually in VoteHub's list on 2026-08-17, newest first.
// This is the regression fixture: under the old fixed 14-day rule these five
// most recent polls were the entire window and averaged exactly 40.000.
const AUGUST_2026: ApprovalPoll[] = [
  poll('2026-08-10', 39.5, 'AlphaROC'),
  poll('2026-08-10', 38, 'YouGov'),
  poll('2026-08-09', 43, 'Morning Consult'),
  poll('2026-08-05', 38, 'John Zogby Strategies'),
  poll('2026-08-04', 41.5, 'Quantus Insights'),
  poll('2026-08-03', 38, 'Ipsos'),
  poll('2026-08-03', 39, 'YouGov'),
  poll('2026-08-02', 42.8, 'Morning Consult'),
  poll('2026-08-01', 38, 'TIPP Insights'),
  poll('2026-07-29', 42, 'Marquette'),
  poll('2026-07-29', 40, 'Big Data Poll'),
  poll('2026-07-27', 37, 'Global Strategy Group'),
  poll('2026-07-27', 33, 'AP-NORC'),
  poll('2026-07-27', 32, 'Quinnipiac'),
  poll('2026-07-27', 34, 'CNN/SSRS'),
  poll('2026-07-27', 39, 'YouGov'),
]

describe('isUsableApprovalPoll', () => {
  it('accepts a well-formed poll', () => {
    expect(isUsableApprovalPoll(poll('2026-08-10', 39.5))).toBe(true)
  })

  it('rejects out-of-range and non-finite percentages', () => {
    // The provider response is cast, not schema-validated: a pct of 460 would
    // otherwise drag the mean ~20 points while staying inside the feed's
    // [10,90] plausibility bounds.
    expect(isUsableApprovalPoll(poll('2026-08-10', 460))).toBe(false)
    expect(isUsableApprovalPoll(poll('2026-08-10', -1))).toBe(false)
    expect(isUsableApprovalPoll(poll('2026-08-10', NaN))).toBe(false)
    expect(isUsableApprovalPoll(poll('2026-08-10', Infinity))).toBe(false)
  })

  it('rejects malformed dates', () => {
    expect(isUsableApprovalPoll(poll('2026-8-10', 39))).toBe(false)
    expect(isUsableApprovalPoll(poll('not-a-date', 39))).toBe(false)
    expect(isUsableApprovalPoll(poll('2026-02-31', 39))).toBe(false)
  })
})

describe('readPublishedApprovalAverage', () => {
  const series = (...rows: [string, number][]) =>
    Object.fromEntries(
      rows.map(([day, average]) => [day, { approve: { average } }])
    )

  it('reads the most recent entry at or before the valuation day', () => {
    const result = readPublishedApprovalAverage(
      series(['2026-08-15', 38.6], ['2026-08-17', 38.8], ['2026-08-18', 99]),
      '2026-08-17'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.price).toBeCloseTo(38.8, 10)
    expect(result.asOfDay).toBe('2026-08-17')
    expect(result.ageDays).toBe(0)
  })

  it('accepts a value a day or two behind — posting late is not a fault', () => {
    const result = readPublishedApprovalAverage(
      series(['2026-08-17', 38.8]),
      '2026-08-19'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ageDays).toBe(2)
  })

  it('refuses once the source itself has stopped updating', () => {
    // The check the old design lacked: staleness was measured on OUR row age,
    // and we wrote a row daily regardless of whether the inputs moved, so a
    // frozen feed went unnoticed for a week.
    const result = readPublishedApprovalAverage(
      series(['2026-08-10', 38.6]),
      '2026-08-17'
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('stale')
    expect(result.reason).toContain('2026-08-10')
  })

  it('ignores entries that are not usable percentages', () => {
    const bad: PublishedAverageSeries = {
      '2026-08-17': { approve: { average: 0 } },
      '2026-08-16': { approve: { average: 100 } },
      '2026-08-15': { approve: { average: NaN } },
      '2026-08-14': { approve: null },
      '2026-08-13': null,
      'not-a-day': { approve: { average: 38 } },
      '2026-08-12': { approve: { average: 38.5 } },
    }
    const result = readPublishedApprovalAverage(bad, '2026-08-17', {
      maxAgeDays: 30,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.asOfDay).toBe('2026-08-12')
    expect(result.price).toBeCloseTo(38.5, 10)
  })

  it('refuses a missing, empty, or malformed payload', () => {
    expect(readPublishedApprovalAverage(null, '2026-08-17').ok).toBe(false)
    expect(readPublishedApprovalAverage({}, '2026-08-17').ok).toBe(false)
    expect(readPublishedApprovalAverage('nope' as never, '2026-08-17').ok).toBe(
      false
    )
    expect(
      readPublishedApprovalAverage(series(['2026-08-17', 38.8]), 'nonsense').ok
    ).toBe(false)
  })
})

describe('readPublishedApprovalSeries', () => {
  it('returns usable days oldest first and drops the rest', () => {
    const out = readPublishedApprovalSeries({
      '2026-08-17': { approve: { average: 38.8 } },
      '2026-08-15': { approve: { average: 38.6 } },
      '2026-08-16': { approve: { average: 0 } },
      bogus: { approve: { average: 38 } },
    })

    expect(out).toEqual([
      { day: '2026-08-15', price: 38.6 },
      { day: '2026-08-17', price: 38.8 },
    ])
  })

  it('returns empty rather than throwing on junk', () => {
    expect(readPublishedApprovalSeries(null)).toEqual([])
    expect(readPublishedApprovalSeries('x' as never)).toEqual([])
  })
})

describe('getApprovalCrossCheckGap', () => {
  it('measures the distance between the two estimators', () => {
    // The real 2026-08-17 pair: VoteHub 38.80, our own 39.82.
    expect(getApprovalCrossCheckGap(38.8, 39.82)).toBeCloseTo(1.02, 10)
    expect(getApprovalCrossCheckGap(39.82, 38.8)).toBeCloseTo(1.02, 10)
  })

  it('catches the failures the tolerance exists for', () => {
    // Approve/disapprove swap, and a 0-1 vs 0-100 units change.
    expect(getApprovalCrossCheckGap(57.5, 38.5) as number).toBeGreaterThan(
      TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP
    )
    expect(getApprovalCrossCheckGap(0.385, 38.5) as number).toBeGreaterThan(
      TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP
    )
  })

  it('stays under tolerance across the observed range', () => {
    // 554 days of real data: median 0.435, p99 1.289, max 1.700.
    for (const gap of [0.435, 1.289, 1.7])
      expect(gap).toBeLessThan(TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP)
  })

  it('returns null — not zero — when either side is unusable', () => {
    expect(getApprovalCrossCheckGap(NaN, 38.5)).toBeNull()
    expect(getApprovalCrossCheckGap(38.5, Infinity)).toBeNull()
  })
})

describe('readApprovePct / hasApproveAnswer', () => {
  const answers = (...rows: [string, number][]) =>
    rows.map(([choice, pct]) => ({ choice, pct }))

  it('reads Approve regardless of case or position', () => {
    expect(readApprovePct(answers(['Disapprove', 61], ['Approve', 39]))).toBe(
      39
    )
    expect(readApprovePct(answers(['APPROVE', 42.8]))).toBe(42.8)
  })

  it('returns null when there is no Approve row', () => {
    expect(readApprovePct(answers(['Favorable', 39]))).toBeNull()
    expect(hasApproveAnswer(answers(['Favorable', 39]))).toBe(false)
  })

  it('returns null for a value that cannot be a percentage', () => {
    // The provider row that motivated this: 460 would survive the feed's
    // [10,90] bounds after being averaged with ~20 polls near 45.
    for (const bad of [460, -1, NaN, Infinity]) {
      expect(readApprovePct(answers(['Approve', bad]))).toBeNull()
      // ...but the row EXISTS, which is what makes it alertable rather than
      // an ordinary poll about a different question.
      expect(hasApproveAnswer(answers(['Approve', bad]))).toBe(true)
    }
  })

  it('survives a malformed or missing answers array', () => {
    expect(readApprovePct(undefined)).toBeNull()
    expect(readApprovePct([] as never)).toBeNull()
    expect(readApprovePct({ choice: 'Approve' } as never)).toBeNull()
    expect(readApprovePct([{ pct: 39 }] as never)).toBeNull()
    expect(readApprovePct(answers(['Approve', '39' as never]))).toBeNull()
    expect(hasApproveAnswer(undefined)).toBe(false)
  })
})

describe('selectApprovalWindow — base window', () => {
  it('uses the plain 14-day window when it holds enough polls', () => {
    const polls = daily('2026-08-17', TRUMP_APPROVAL_MIN_POLLS + 2, 40)
    const result = selectApprovalWindow(polls, '2026-08-17')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.extended).toBe(false)
    expect(result.window.spanDays).toBe(14)
    expect(result.window.startDate).toBe('2026-08-04')
    expect(result.window.polls).toHaveLength(TRUMP_APPROVAL_MIN_POLLS + 2)
  })

  it('excludes polls that end after the valuation day', () => {
    const polls = [
      ...daily('2026-08-17', TRUMP_APPROVAL_MIN_POLLS, 40),
      poll('2026-08-18', 99),
    ]
    const result = selectApprovalWindow(polls, '2026-08-17')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.polls.some((p) => p.pct === 99)).toBe(false)
  })

  it('drops polls outside the base window once the floor is satisfied', () => {
    const polls = [
      ...daily('2026-08-17', TRUMP_APPROVAL_MIN_POLLS + 1, 40),
      poll('2026-07-01', 10),
    ]
    const result = selectApprovalWindow(polls, '2026-08-17')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.extended).toBe(false)
    expect(result.window.polls.some((p) => p.pct === 10)).toBe(false)
  })
})

describe('selectApprovalWindow — count floor', () => {
  it('widens the window when the base window is short', () => {
    const result = selectApprovalWindow(AUGUST_2026, '2026-08-17')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.extended).toBe(true)
    expect(result.window.startDate).toBe('2026-07-27')
    expect(result.window.spanDays).toBe(22)
  })

  it('admits every poll tied at the cut-off date', () => {
    // The 12th most recent poll ends 2026-07-27, and five polls share that
    // date. All five must come in, or the result depends on array order.
    const result = selectApprovalWindow(AUGUST_2026, '2026-08-17')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.polls).toHaveLength(16)
    expect(
      result.window.polls.filter((p) => p.endDate === '2026-07-27')
    ).toHaveLength(5)
  })

  it('is independent of input order', () => {
    const shuffled = [...AUGUST_2026].reverse()
    const a = selectApprovalWindow(AUGUST_2026, '2026-08-17')
    const b = selectApprovalWindow(shuffled, '2026-08-17')

    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.window.startDate).toBe(a.window.startDate)
    expect(b.window.polls).toHaveLength(a.window.polls.length)
    expect(averageApprovalPct(b.window.polls)).toBeCloseTo(
      averageApprovalPct(a.window.polls) as number,
      10
    )
  })

  it('never narrows below the base window', () => {
    // A dense recent burst puts the Nth most recent poll inside the base
    // window; the window must stay 14 days wide, not shrink to the burst.
    const polls = cluster('2026-08-17', TRUMP_APPROVAL_MIN_POLLS + 5, 40)
    const result = selectApprovalWindow(polls, '2026-08-17')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.startDate).toBe('2026-08-04')
    expect(result.window.spanDays).toBe(14)
    expect(result.window.extended).toBe(false)
  })
})

describe('selectApprovalWindow — the drought invariant', () => {
  // This is the property the change exists for: with no new polls arriving,
  // the selected set must not change, so the price cannot be predicted and
  // traded against.
  it('selects an identical set on every day of a drought', () => {
    const days = Array.from({ length: 10 }, (_, i) => shift('2026-08-17', i))
    const prices = days.map((day) => {
      const point = computeApprovalPoint(AUGUST_2026, day)
      expect(point.ok).toBe(true)
      return point.ok ? point.price : NaN
    })

    for (const price of prices) expect(price).toBeCloseTo(prices[0], 10)
  })

  it('moves only when a new poll actually arrives', () => {
    const before = computeApprovalPoint(AUGUST_2026, '2026-08-18')
    const after = computeApprovalPoint(
      [...AUGUST_2026, poll('2026-08-18', 30, 'New')],
      '2026-08-18'
    )

    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) return
    expect(after.price).not.toBeCloseTo(before.price, 6)
  })

  it('can evict a whole tied cluster when an arrival satisfies the floor', () => {
    // Documented residual, pinned so it cannot change unnoticed.
    //
    // On 08-17 the floor needs 12 and the cut lands on the five-poll 07-27
    // cluster, admitting 16. One arrival on 08-18 moves the cut to 07-29,
    // where 12 polls suffice, and all five 07-27 polls leave at once. Because
    // that cluster averaged 35 against a window near 39.9, the index rises
    // even though the arriving poll printed 30.
    //
    // This is bounded and, unlike the drought drift this change removes, it
    // cannot be timed: it fires only on an arrival, which is the one event
    // nobody schedules. Backtested over 560 days the floor-engaged regime is
    // the calmest of the two (mean |move| 0.111 vs 0.174 overall), and every
    // wrong-direction move in that history came from the ordinary 14-day
    // regime instead. Smoothing it needs a ratcheted window start, which
    // trades a large step up in explainability cost for this.
    const after = computeApprovalPoint(
      [...AUGUST_2026, poll('2026-08-18', 30, 'New')],
      '2026-08-18'
    )

    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.window.startDate).toBe('2026-07-29')
    expect(after.window.polls).toHaveLength(12)
    expect(after.price).toBeCloseTo(39.15, 3)
  })

  it('still expires on schedule ABOVE the floor — the claim is not general', () => {
    // The security property holds only while the floor is engaged. With 13
    // polls the base window governs, so the 14-day edge still retires a poll
    // with nothing arriving to replace it, and the price moves on a schedule
    // anyone can read off the source list a day ahead.
    //
    // Measured over 554 days: 87 of the 181 zero-arrival days (48.1%) still
    // move under this rule, mean 0.073 and max 0.84. Kept as a test so the
    // exposure is documented rather than implied away.
    const oldest = poll('2026-08-04', 20, 'Oldest')
    const polls = [
      oldest,
      ...Array.from({ length: 12 }, (_, i) =>
        poll(shift('2026-08-16', -i), 40)
      ),
    ]

    const before = computeApprovalPoint(polls, '2026-08-17')
    const after = computeApprovalPoint(polls, '2026-08-18')

    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) return
    // 13 polls on the 17th; on the 18th the 08-04 poll falls out of the base
    // window, 12 remain, the floor is satisfied and nothing widens.
    expect(before.window.polls).toHaveLength(13)
    expect(after.window.polls).toHaveLength(12)
    expect(after.window.extended).toBe(false)
    // No poll arrived, and the price moved anyway.
    expect(before.price).toBeCloseTo((12 * 40 + 20) / 13, 10)
    expect(after.price).toBeCloseTo(40, 10)
  })

  it('reproduces the 2026-08 regression: flat instead of drifting to 40', () => {
    // Under the old fixed 14-day rule these same polls priced 39.98 on 08-10
    // and 40.00 on 08-17 with no new data. Now both days price the same.
    const tenth = computeApprovalPoint(AUGUST_2026, '2026-08-10')
    const seventeenth = computeApprovalPoint(AUGUST_2026, '2026-08-17')

    expect(tenth.ok && seventeenth.ok).toBe(true)
    if (!tenth.ok || !seventeenth.ok) return
    expect(tenth.price).toBeCloseTo(38.425, 3)
    expect(seventeenth.price).toBeCloseTo(38.425, 3)
  })
})

describe('selectApprovalWindow — failing closed', () => {
  it('refuses when the floor cannot be met inside the max window', () => {
    const polls = [
      poll('2026-08-10', 39.5),
      poll('2026-08-09', 43),
      poll('2026-08-04', 41.5),
    ]
    const result = selectApprovalWindow(polls, '2026-08-17')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('need')
  })

  it('refuses when the only polls are older than the max window', () => {
    const stale = shift('2026-08-17', -(TRUMP_APPROVAL_MAX_WINDOW_DAYS + 5))
    const result = selectApprovalWindow(
      cluster(stale, TRUMP_APPROVAL_MIN_POLLS + 5, 40),
      '2026-08-17'
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain(`${TRUMP_APPROVAL_MAX_WINDOW_DAYS} days`)
  })

  it('refuses when there are no usable polls at all', () => {
    expect(selectApprovalWindow([], '2026-08-17').ok).toBe(false)
    expect(
      selectApprovalWindow([poll('2026-08-10', 460)], '2026-08-17').ok
    ).toBe(false)
  })

  it('rejects an invalid valuation day or bounds', () => {
    expect(selectApprovalWindow(AUGUST_2026, 'nonsense').ok).toBe(false)
    expect(
      selectApprovalWindow(AUGUST_2026, '2026-08-17', { minPolls: 0 }).ok
    ).toBe(false)
    expect(
      selectApprovalWindow(AUGUST_2026, '2026-08-17', {
        windowDays: 14,
        maxWindowDays: 7,
      }).ok
    ).toBe(false)
  })
})

describe('averageApprovalPct', () => {
  it('averages usable polls and ignores corrupt ones', () => {
    expect(
      averageApprovalPct([poll('2026-08-10', 38), poll('2026-08-10', 42)])
    ).toBeCloseTo(40, 10)
    expect(
      averageApprovalPct([poll('2026-08-10', 38), poll('2026-08-10', 460)])
    ).toBeCloseTo(38, 10)
  })

  it('returns null rather than NaN on an empty set', () => {
    expect(averageApprovalPct([])).toBeNull()
    expect(averageApprovalPct([poll('2026-08-10', NaN)])).toBeNull()
  })
})

describe('decideApprovalPublish', () => {
  const now = Date.parse('2026-08-22T20:00:00Z')

  it('publishes when there is no prior point', () => {
    expect(decideApprovalPublish({ price: 38.4, last: null, now })).toEqual({
      publish: true,
      reason: 'first',
    })
  })

  it('publishes as soon as the source value moves', () => {
    // The whole point of hourly running: a move at 2pm must not sit in public
    // view as tomorrow morning's mark.
    const last = { price: 38.4, ts: now - 60_000 }
    expect(decideApprovalPublish({ price: 38.5, last, now })).toEqual({
      publish: true,
      reason: 'changed',
    })
  })

  it('does not republish an unchanged value within the heartbeat', () => {
    const last = { price: 38.4, ts: now - TRUMP_APPROVAL_HEARTBEAT_MS + 1000 }
    const decision = decideApprovalPublish({ price: 38.4, last, now })

    expect(decision.publish).toBe(false)
    expect(decision.reason).toContain('unchanged')
  })

  it('re-stamps an unchanged value once the heartbeat elapses', () => {
    // Their average genuinely held 38.4 for three days running; without this
    // the feed would age past staleAfterMs and pause the engine while the
    // source was working perfectly.
    const last = { price: 38.4, ts: now - TRUMP_APPROVAL_HEARTBEAT_MS }
    expect(decideApprovalPublish({ price: 38.4, last, now })).toEqual({
      publish: true,
      reason: 'heartbeat',
    })
  })

  it('keeps the heartbeat well inside the feed staleness bound', () => {
    // staleAfterMs is 26h and the market's maxOraclePriceAgeMs is 30h, so two
    // heartbeats a day leaves real margin.
    expect(TRUMP_APPROVAL_HEARTBEAT_MS).toBeLessThan(26 * 60 * 60 * 1000)
  })

  it('detects a one-decimal move, the smallest the source can express', () => {
    const last = { price: 38.4, ts: now - 60_000 }
    expect(decideApprovalPublish({ price: 38.5, last, now }).publish).toBe(true)
    expect(decideApprovalPublish({ price: 38.4, last, now }).publish).toBe(
      false
    )
  })

  it('treats a corrupt prior point as no prior point', () => {
    for (const bad of [NaN, Infinity]) {
      expect(
        decideApprovalPublish({
          price: 38.4,
          last: { price: bad, ts: now },
          now,
        })
      ).toEqual({ publish: true, reason: 'first' })
      expect(
        decideApprovalPublish({
          price: 38.4,
          last: { price: 38.4, ts: bad },
          now,
        })
      ).toEqual({ publish: true, reason: 'first' })
    }
  })

  it('refuses on invalid inputs rather than publishing garbage', () => {
    expect(decideApprovalPublish({ price: NaN, last: null, now }).publish).toBe(
      false
    )
    expect(
      decideApprovalPublish({ price: 38.4, last: null, now: NaN }).publish
    ).toBe(false)
    expect(
      decideApprovalPublish({ price: 38.4, last: null, now, heartbeatMs: 0 })
        .publish
    ).toBe(false)
  })
})

describe('decideApprovalPublish — concurrency guards', () => {
  const now = Date.parse('2026-08-23T12:00:00Z')

  it('declines when a concurrent publisher already wrote the same value', () => {
    // The locked re-check re-runs this against a fresh read. A publisher that
    // stalled in the cross-check fetch must not append a duplicate behind the
    // one that got there first.
    const last = { price: 38.4, ts: now - 1000 }
    expect(decideApprovalPublish({ price: 38.4, last, now }).publish).toBe(
      false
    )
  })

  it('still publishes a genuinely newer value behind a concurrent write', () => {
    const last = { price: 38.4, ts: now - 1000 }
    expect(decideApprovalPublish({ price: 38.5, last, now }).publish).toBe(true)
  })
})

describe('lookback covers the day actually valued', () => {
  it('reaches the max window measured from the oldest valuable as-of day', () => {
    // The cross-check is computed for published.asOfDay, which can trail today
    // by TRUMP_APPROVAL_MAX_SOURCE_AGE_DAYS. A lookback measured from today
    // would deliver a window that many days short of the documented span.
    const polls = Array.from({ length: TRUMP_APPROVAL_MIN_POLLS }, (_, i) =>
      poll(shift('2026-08-20', -i - 20), 38)
    )
    const asOfDay = '2026-08-20'
    const result = selectApprovalWindow(polls, asOfDay)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Everything selected must sit inside the fetched span.
    const oldest = result.window.startDate
    const spanFromAsOf = Math.round(
      (Date.parse(`${asOfDay}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) /
        86_400_000
    )
    expect(spanFromAsOf).toBeLessThanOrEqual(TRUMP_APPROVAL_MAX_WINDOW_DAYS)
  })
})
