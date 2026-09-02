import {
  AveragePoll,
  PublishedAverageSeries,
  averagePollPct,
  computePollAveragePoint,
  getCrossCheckGap,
  hasAnswer,
  isUsablePoll,
  parseDay,
  readAnswerPct,
  readPublishedAverage,
  readPublishedAverageValue,
  readPublishedSeries,
  selectPollWindow,
  shiftDay,
} from './votehub-average'
import {
  TRUMP_APPROVAL_RULES,
  readPublishedApprovalAverage,
  readPublishedApprovalSeries,
} from './trump-approval'

// The parameterised reader behind every VoteHub feed. The Trump test file
// pins the Trump wrappers; this one pins what the generalisation added —
// answer-key selection — and that the shared validity rules hold for every
// key, not just `approve`.

const poll = (endDate: string, pct: number, pollster = 'P'): AveragePoll => ({
  endDate,
  pct,
  pollster,
})

/** One poll per day for `count` days, ending on `endDate`. */
const daily = (endDate: string, count: number, pct: number) =>
  Array.from({ length: count }, (_, i) =>
    poll(shiftDay(endDate, -i) as string, pct)
  )

// A generic-ballot day carries both parties; a favorability day both
// verdicts. The reader must pick the requested one and only that one.
const ballot = (dem: number, rep: number) => ({
  dem: { average: dem },
  rep: { average: rep },
})
const favorability = (favorable: number, unfavorable: number) => ({
  favorable: { average: favorable },
  unfavorable: { average: unfavorable },
})

describe('readPublishedAverage — answer key selection', () => {
  const series: PublishedAverageSeries = {
    '2026-09-01': ballot(46.2, 43.9),
    '2026-08-31': ballot(46.0, 44.1),
  }

  it('reads the requested answer and ignores its siblings', () => {
    const dem = readPublishedAverage(series, '2026-09-01', {
      answerKey: 'dem',
      maxAgeDays: 3,
    })
    const rep = readPublishedAverage(series, '2026-09-01', {
      answerKey: 'rep',
      maxAgeDays: 3,
    })
    expect(dem.ok && rep.ok).toBe(true)
    if (!dem.ok || !rep.ok) return
    expect(dem.price).toBeCloseTo(46.2, 10)
    expect(rep.price).toBeCloseTo(43.9, 10)
    expect(dem.asOfDay).toBe('2026-09-01')
  })

  it('finds nothing under an answer key the series does not carry', () => {
    // The failure mode a mis-specified feed must have: no price, not a
    // sibling's price and not a default.
    const result = readPublishedAverage(series, '2026-09-01', {
      answerKey: 'approve',
      maxAgeDays: 3,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('approve')
  })

  it('reads favorability the same way', () => {
    const result = readPublishedAverage(
      { '2026-09-01': favorability(41.5, 49.0) },
      '2026-09-01',
      { answerKey: 'favorable', maxAgeDays: 3 }
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.price).toBeCloseTo(41.5, 10)
  })

  it('refuses an empty or non-string answer key', () => {
    expect(
      readPublishedAverage(series, '2026-09-01', {
        answerKey: '',
        maxAgeDays: 3,
      }).ok
    ).toBe(false)
    expect(
      readPublishedAverage(series, '2026-09-01', {
        answerKey: undefined as never,
        maxAgeDays: 3,
      }).ok
    ).toBe(false)
  })
})

describe('readPublishedAverage — validity rules apply per key', () => {
  it('rejects 0 and 100 under any key, and skips to the next usable day', () => {
    // A cleared field on the tracked answer must not be read as a price even
    // when its sibling is perfectly healthy.
    const series: PublishedAverageSeries = {
      '2026-09-01': ballot(0, 54),
      '2026-08-31': ballot(100, 0),
      '2026-08-30': ballot(46.5, 43.5),
    }
    const dem = readPublishedAverage(series, '2026-09-01', {
      answerKey: 'dem',
      maxAgeDays: 3,
    })
    expect(dem.ok).toBe(true)
    if (!dem.ok) return
    expect(dem.asOfDay).toBe('2026-08-30')
    expect(dem.ageDays).toBe(2)
  })

  it('rejects a non-finite, missing, or null answer object', () => {
    const series: PublishedAverageSeries = {
      '2026-09-01': { dem: { average: NaN } },
      '2026-08-31': { dem: null },
      '2026-08-30': { dem: {} },
      '2026-08-29': null,
      '2026-08-28': { rep: { average: 44 } },
    }
    expect(
      readPublishedAverage(series, '2026-09-01', {
        answerKey: 'dem',
        maxAgeDays: 30,
      }).ok
    ).toBe(false)
  })

  it('refuses once the source itself has stopped updating', () => {
    const result = readPublishedAverage(
      { '2026-08-20': ballot(46, 44) },
      '2026-09-01',
      { answerKey: 'dem', maxAgeDays: 3 }
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('stale')
  })

  it('accepts a value a day or two behind', () => {
    const result = readPublishedAverage(
      { '2026-08-30': ballot(46, 44) },
      '2026-09-01',
      { answerKey: 'dem', maxAgeDays: 3 }
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ageDays).toBe(2)
  })

  it('never reads a margin as a share', () => {
    // If a provider only published D-R, the entry would carry no per-party
    // object; the feed must refuse rather than synthesise a share.
    const series: PublishedAverageSeries = {
      '2026-09-01': { margin: { average: 2.3 } },
    }
    expect(
      readPublishedAverage(series, '2026-09-01', {
        answerKey: 'dem',
        maxAgeDays: 3,
      }).ok
    ).toBe(false)
  })
})

describe('readPublishedAverageValue', () => {
  it('reads a usable average and nothing else', () => {
    expect(readPublishedAverageValue(ballot(46.2, 43.9), 'dem')).toBe(46.2)
    expect(readPublishedAverageValue(ballot(46.2, 43.9), 'rep')).toBe(43.9)
    expect(readPublishedAverageValue(ballot(46.2, 43.9), 'ind')).toBeNull()
    expect(readPublishedAverageValue(null, 'dem')).toBeNull()
    expect(readPublishedAverageValue('x' as never, 'dem')).toBeNull()
    expect(readPublishedAverageValue({ dem: { average: 0 } }, 'dem')).toBeNull()
    expect(
      readPublishedAverageValue({ dem: { average: 100 } }, 'dem')
    ).toBeNull()
    expect(
      readPublishedAverageValue({ dem: { average: '46' as never } }, 'dem')
    ).toBeNull()
  })
})

describe('readPublishedSeries', () => {
  it('returns the requested answer, usable days only, oldest first', () => {
    const out = readPublishedSeries(
      {
        '2026-09-01': ballot(46.2, 43.9),
        '2026-08-30': ballot(46.0, 44.1),
        '2026-08-31': ballot(46.1, 0),
        bogus: ballot(46, 44),
      },
      { answerKey: 'rep' }
    )
    expect(out).toEqual([
      { day: '2026-08-30', price: 44.1 },
      { day: '2026-09-01', price: 43.9 },
    ])
  })

  it('returns empty rather than throwing on junk or a bad key', () => {
    expect(readPublishedSeries(null, { answerKey: 'dem' })).toEqual([])
    expect(readPublishedSeries('x' as never, { answerKey: 'dem' })).toEqual([])
    expect(
      readPublishedSeries({ '2026-09-01': ballot(46, 44) }, { answerKey: '' })
    ).toEqual([])
  })
})

describe('the Trump wrappers are the generic reader with answerKey approve', () => {
  const series: PublishedAverageSeries = {
    '2026-08-17': { approve: { average: 38.8 }, disapprove: { average: 57 } },
    '2026-08-15': { approve: { average: 38.6 }, disapprove: { average: 57 } },
  }

  it('reads the same value through either path', () => {
    const generic = readPublishedAverage(series, '2026-08-17', {
      answerKey: 'approve',
      maxAgeDays: TRUMP_APPROVAL_RULES.maxSourceAgeDays,
    })
    expect(readPublishedApprovalAverage(series, '2026-08-17')).toEqual(generic)
    expect(readPublishedApprovalSeries(series)).toEqual(
      readPublishedSeries(series, { answerKey: 'approve' })
    )
  })

  it('carries the documented Trump constants', () => {
    expect(TRUMP_APPROVAL_RULES).toEqual({
      windowDays: 14,
      minPolls: 12,
      maxWindowDays: 35,
      maxSourceAgeDays: 3,
      maxCrossCheckGap: 3,
      heartbeatMs: 12 * 60 * 60 * 1000,
    })
  })
})

describe('readAnswerPct / hasAnswer — arbitrary choices', () => {
  const answers = (...rows: [string, number][]) =>
    rows.map(([choice, pct]) => ({ choice, pct }))

  it('reads the requested choice regardless of case or position', () => {
    const ballotPoll = answers(['Rep', 44], ['Dem', 47], ['Other', 3])
    expect(readAnswerPct(ballotPoll, 'Dem')).toBe(47)
    expect(readAnswerPct(ballotPoll, 'dem')).toBe(47)
    expect(readAnswerPct(ballotPoll, 'Rep')).toBe(44)
    expect(
      readAnswerPct(
        answers(['Unfavorable', 52], ['Favorable', 41]),
        'Favorable'
      )
    ).toBe(41)
  })

  it('returns null when the choice is absent, and says so via hasAnswer', () => {
    expect(readAnswerPct(answers(['Approve', 39]), 'Dem')).toBeNull()
    expect(hasAnswer(answers(['Approve', 39]), 'Dem')).toBe(false)
    expect(hasAnswer(answers(['Approve', 39]), 'approve')).toBe(true)
  })

  it('returns null for a value that cannot be a percentage but reports the row', () => {
    for (const bad of [460, -1, NaN, Infinity]) {
      expect(readAnswerPct(answers(['Dem', bad]), 'Dem')).toBeNull()
      expect(hasAnswer(answers(['Dem', bad]), 'Dem')).toBe(true)
    }
  })

  it('survives malformed input', () => {
    expect(readAnswerPct(undefined, 'Dem')).toBeNull()
    expect(readAnswerPct([{ pct: 39 }] as never, 'Dem')).toBeNull()
    expect(readAnswerPct(answers(['Dem', 47]), undefined as never)).toBeNull()
    expect(hasAnswer(answers(['Dem', 47]), undefined as never)).toBe(false)
  })
})

describe('selectPollWindow / computePollAveragePoint with explicit rules', () => {
  const rules = { windowDays: 14, minPolls: 3, maxWindowDays: 35 }

  it('averages the base window when the floor is met', () => {
    const point = computePollAveragePoint(
      daily('2026-09-01', 5, 46),
      '2026-09-01',
      rules
    )
    expect(point.ok).toBe(true)
    if (!point.ok) return
    expect(point.price).toBeCloseTo(46, 10)
    expect(point.window.extended).toBe(false)
    expect(point.window.spanDays).toBe(14)
  })

  it('widens to the Nth most recent poll when polling is thin', () => {
    // Favorability-shaped input: sparse polls, so the floor engages.
    const polls = [
      poll('2026-08-30', 40),
      poll('2026-08-10', 42),
      poll('2026-08-05', 44),
    ]
    const result = selectPollWindow(polls, '2026-09-01', rules)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.extended).toBe(true)
    expect(result.window.startDate).toBe('2026-08-05')
    expect(result.window.polls).toHaveLength(3)
  })

  it('fails closed past maxWindowDays instead of averaging stale polls', () => {
    const polls = [poll('2026-08-30', 40), poll('2026-07-01', 42)]
    const result = selectPollWindow(polls, '2026-09-01', rules)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('need 3')
  })

  it('rejects invalid rules rather than defaulting them', () => {
    expect(
      selectPollWindow(daily('2026-09-01', 5, 46), '2026-09-01', {
        ...rules,
        minPolls: 0,
      }).ok
    ).toBe(false)
    expect(
      selectPollWindow(daily('2026-09-01', 5, 46), '2026-09-01', {
        ...rules,
        maxWindowDays: 7,
      }).ok
    ).toBe(false)
  })

  it('is the Trump selection when given the Trump rules', () => {
    const polls = daily('2026-09-01', TRUMP_APPROVAL_RULES.minPolls + 1, 40)
    const result = selectPollWindow(polls, '2026-09-01', TRUMP_APPROVAL_RULES)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.window.spanDays).toBe(14)
  })
})

describe('helpers', () => {
  it('isUsablePoll mirrors the validity rules', () => {
    expect(isUsablePoll(poll('2026-09-01', 46))).toBe(true)
    expect(isUsablePoll(poll('2026-09-01', 460))).toBe(false)
    expect(isUsablePoll(poll('2026-13-01', 46))).toBe(false)
  })

  it('averagePollPct ignores corrupt polls and returns null on none', () => {
    expect(averagePollPct([poll('a', 460), poll('2026-09-01', 46)])).toBe(46)
    expect(averagePollPct([])).toBeNull()
  })

  it('getCrossCheckGap is symmetric and null on junk', () => {
    expect(getCrossCheckGap(46.2, 45.1)).toBeCloseTo(1.1, 10)
    expect(getCrossCheckGap(45.1, 46.2)).toBeCloseTo(1.1, 10)
    expect(getCrossCheckGap(NaN, 45.1)).toBeNull()
  })

  it('parseDay rejects impossible calendar dates', () => {
    expect(parseDay('2026-09-01')).toBe(Date.UTC(2026, 8, 1))
    expect(parseDay('2026-02-31')).toBeNull()
    expect(parseDay('2026-9-1')).toBeNull()
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDay('nope', -1)).toBeNull()
  })
})
