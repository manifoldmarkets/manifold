import { DAY_MS } from '../util/time'
import {
  OPEN_WEIGHT_MODELS,
  OPEN_WEIGHT_WINDOW_DAYS,
  RankingRow,
  basePermaslug,
  classifyModel,
  computeOpenWeightShare,
  newestWindowDates,
  openWeightWindowRange,
  utcDateString,
  validateOpenWeightPublication,
} from './open-weight-models'

const row = (
  date: string,
  model_permaslug: string,
  total_tokens: string | number
): RankingRow => ({
  date,
  model_permaslug,
  total_tokens: String(total_tokens),
})

// A real open model and a real closed one, so the fixtures exercise the
// shipped map rather than a parallel test-only classification.
const OPEN = 'deepseek/deepseek-v4-flash-20260423'
const CLOSED = 'anthropic/claude-opus-5-20260723'

describe('basePermaslug', () => {
  it('strips the variant suffix so :free is not a separate model', () => {
    expect(basePermaslug('openai/gpt-oss-20b:free')).toBe('openai/gpt-oss-20b')
    expect(basePermaslug('openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b')
  })

  it('classifies a :free variant identically to the paid one', () => {
    expect(classifyModel('openai/gpt-oss-20b:free')).toEqual(
      classifyModel('openai/gpt-oss-20b')
    )
    expect(classifyModel('openai/gpt-oss-20b:free')?.open).toBe(true)
  })
})

describe('computeOpenWeightShare', () => {
  it('is the open share of classified tokens', () => {
    const rows = [row('2026-07-26', OPEN, 750), row('2026-07-26', CLOSED, 250)]
    expect(computeOpenWeightShare(rows).share).toBeCloseTo(75)
  })

  it('excludes `other` from the denominator (rule 1)', () => {
    const withoutOther = [
      row('2026-07-26', OPEN, 600),
      row('2026-07-26', CLOSED, 400),
    ]
    const withOther = [...withoutOther, row('2026-07-26', 'other', 1000)]
    // `other` doubles the payload but must not move the index.
    expect(computeOpenWeightShare(withOther).share).toBeCloseTo(60)
    expect(computeOpenWeightShare(withOther).share).toBe(
      computeOpenWeightShare(withoutOther).share
    )
    // ...and the classified total is strictly below the payload total (§7.4).
    const res = computeOpenWeightShare(withOther)
    expect(res.classifiedTokens).toBeLessThan(res.payloadTokens)
  })

  it('drops unclassified models from BOTH sides and reports them (rule 2)', () => {
    const rows = [
      row('2026-07-26', OPEN, 500),
      row('2026-07-26', CLOSED, 500),
      row('2026-07-26', 'newlab/brand-new-model-20260801', 100000),
    ]
    const res = computeOpenWeightShare(rows)
    // A huge unknown model must not drag the index toward either side.
    expect(res.share).toBeCloseTo(50)
    expect(res.unclassified).toEqual(['newlab/brand-new-model-20260801'])
    expect(res.classifiedTokens).toBe(1000)
  })

  it('reports no unclassified models for a fully-known payload', () => {
    const rows = [row('2026-07-26', OPEN, 1), row('2026-07-26', 'other', 1)]
    expect(computeOpenWeightShare(rows).unclassified).toEqual([])
  })

  it('keeps only the newest N dates', () => {
    // 9 days present; only the last 7 may count.
    const rows: RankingRow[] = []
    for (let d = 18; d <= 26; d++) {
      const date = `2026-07-${d}`
      // Old days are 100% open, new days 0% — so a leaked old day shows up.
      rows.push(row(date, d <= 19 ? OPEN : CLOSED, 1000))
    }
    const res = computeOpenWeightShare(rows)
    expect(res.dates).toHaveLength(OPEN_WEIGHT_WINDOW_DAYS)
    expect(res.dates[0]).toBe('2026-07-20')
    expect(res.dates[6]).toBe('2026-07-26')
    expect(res.share).toBeCloseTo(0)
  })

  it('sums past Number.MAX_SAFE_INTEGER without losing units', () => {
    // 7 days x ~1.5e12 tokens/day/model clears 2^53 in aggregate; doubles
    // start dropping integers there, BigInt does not.
    const big = '9007199254740993' // 2^53 + 1, unrepresentable as a double
    const rows = [row('2026-07-26', OPEN, big), row('2026-07-26', CLOSED, big)]
    expect(computeOpenWeightShare(rows).share).toBeCloseTo(50)
  })

  it('returns null rather than 0 when nothing is classified', () => {
    const rows = [row('2026-07-26', 'other', 100)]
    expect(computeOpenWeightShare(rows).share).toBeNull()
    expect(computeOpenWeightShare([]).share).toBeNull()
  })

  it('fails closed when any token count is malformed', () => {
    const rows = [
      row('2026-07-26', OPEN, 'not-a-number'),
      row('2026-07-26', CLOSED, 100),
    ]
    const result = computeOpenWeightShare(rows)
    expect(result.share).toBeNull()
    expect(result.invalidTokenRows).toEqual([`2026-07-26:${OPEN}`])
  })

  it('truncates a fractional count rather than dropping the row', () => {
    // Format drift that zeroed only SOME rows would silently skew the index
    // toward whichever side still parsed.
    const rows = [
      row('2026-07-26', OPEN, '300.7'),
      row('2026-07-26', CLOSED, '100'),
    ]
    expect(computeOpenWeightShare(rows).share).toBeCloseTo(75)
  })
})

describe('publication validation', () => {
  const completeWindow = () => {
    const rows: RankingRow[] = []
    for (let day = 20; day <= 26; day++) {
      const date = `2026-07-${day}`
      rows.push(row(date, OPEN, 600))
      rows.push(row(date, CLOSED, 400))
      rows.push(row(date, 'other', 1000))
    }
    return rows
  }

  it('accepts a complete, classified payload with `other` present', () => {
    const result = computeOpenWeightShare(completeWindow())
    expect(validateOpenWeightPublication(result)).toEqual({
      ok: true,
      share: 60,
    })
  })

  it('rejects unknown models instead of publishing a shrunken denominator', () => {
    const rows = completeWindow()
    rows.push(row('2026-07-26', 'newlab/unknown', 1000))
    const validation = validateOpenWeightPublication(
      computeOpenWeightShare(rows)
    )
    expect(validation.ok).toBe(false)
    if (!validation.ok)
      expect(validation.reason).toContain('unclassified models')
  })

  it('rejects short, gapped, and missing-other windows', () => {
    const short = completeWindow().filter((row) => row.date !== '2026-07-20')
    expect(
      validateOpenWeightPublication(computeOpenWeightShare(short)).ok
    ).toBe(false)

    const gapped = completeWindow().filter((row) => row.date !== '2026-07-23')
    gapped.push(row('2026-07-27', OPEN, 600))
    gapped.push(row('2026-07-27', CLOSED, 400))
    gapped.push(row('2026-07-27', 'other', 1000))
    const gapValidation = validateOpenWeightPublication(
      computeOpenWeightShare(gapped)
    )
    expect(gapValidation.ok).toBe(false)
    if (!gapValidation.ok)
      expect(gapValidation.reason).toContain('non-consecutive')

    const noOther = completeWindow().filter(
      (row) => row.model_permaslug !== 'other'
    )
    const otherValidation = validateOpenWeightPublication(
      computeOpenWeightShare(noOther)
    )
    expect(otherValidation.ok).toBe(false)
    if (!otherValidation.ok)
      expect(otherValidation.reason).toContain('no excluded `other`')
  })

  it('reports an invalid window date separately from a date gap', () => {
    const result = computeOpenWeightShare(completeWindow())
    result.dates[3] = 'not-a-date'

    expect(validateOpenWeightPublication(result)).toEqual({
      ok: false,
      reason: 'invalid window date: not-a-date',
    })
  })
})

describe('window dates', () => {
  // 2026-07-27T12:30:00Z — midday, so a UTC/local mixup would show.
  const NOON = Date.UTC(2026, 6, 27, 12, 30)

  it('requests one day past the window head', () => {
    // OpenRouter clamps end_date to the last complete UTC day, so asking
    // through today yields exactly 7 complete days.
    expect(openWeightWindowRange(NOON)).toEqual({
      startDate: '2026-07-20',
      endDate: '2026-07-27',
    })
  })

  it('does not slip a day just before or after UTC midnight', () => {
    const justBefore = Date.UTC(2026, 6, 27, 23, 59, 59)
    const justAfter = Date.UTC(2026, 6, 28, 0, 0, 1)
    expect(openWeightWindowRange(justBefore).endDate).toBe('2026-07-27')
    expect(openWeightWindowRange(justAfter).endDate).toBe('2026-07-28')
    // The range is always exactly `days` wide in whole UTC days.
    const r = openWeightWindowRange(justAfter)
    expect((Date.parse(r.endDate) - Date.parse(r.startDate)) / DAY_MS).toBe(
      OPEN_WEIGHT_WINDOW_DAYS
    )
  })

  it('picks up a partial current day automatically if one ever appears', () => {
    // Forward-compatibility: 8 dates present -> the oldest drops out, so the
    // window stays 7 wide and includes the newest (partial) day.
    const rows: RankingRow[] = []
    for (let d = 20; d <= 27; d++) rows.push(row(`2026-07-${d}`, OPEN, 1))
    expect(newestWindowDates(rows)).toEqual([
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
    ])
  })

  it('formats UTC dates without local-timezone drift', () => {
    expect(utcDateString(Date.UTC(2026, 6, 27, 0, 0, 0))).toBe('2026-07-27')
    expect(utcDateString(Date.UTC(2026, 6, 27, 23, 59, 59))).toBe('2026-07-27')
  })
})

describe('the published list', () => {
  it('keys on base permaslugs only — a :free key would never be hit', () => {
    for (const key of Object.keys(OPEN_WEIGHT_MODELS))
      expect(key).toBe(basePermaslug(key))
  })

  it('cites public weights for every open model and none for closed ones', () => {
    for (const [slug, c] of Object.entries(OPEN_WEIGHT_MODELS)) {
      if (c.open) expect(`${slug}:${c.weights ?? ''}`).toMatch(/.+\/.+/)
      else expect(c.weights).toBeUndefined()
    }
  })
})
