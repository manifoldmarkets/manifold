import { DAY_MS } from '../util/time'
import {
  OPENROUTER_MAX_SOURCE_LAG_DAYS,
  OPEN_WEIGHT_MODELS,
  OPEN_WEIGHT_WINDOW_DAYS,
  RankingRow,
  basePermaslug,
  classifyModel,
  computeOpenWeightShare,
  isCompositeSlug,
  isValidPermaslug,
  newestWindowDates,
  openRouterSourceLagDays,
  openWeightWindowRange,
  utcDateString,
  validateOpenRouterSourceFreshness,
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

  it('does not read unclassified tokens as the excluded `other` row', () => {
    // Unknown tokens also push payloadTokens above classifiedTokens, so the
    // looser "payload exceeds classified" form passed a payload that had no
    // `other` row at all.
    const rows = [
      row('2026-07-26', OPEN, 600),
      row('2026-07-26', CLOSED, 400),
      row('2026-07-26', 'newlab/unknown', 50),
    ]
    const res = computeOpenWeightShare(rows)
    expect(res.hasExcludedPayload).toBe(false)
    expect(res.otherTokens).toBe(0)
    expect(res.unclassifiedTokens).toBe(50)
  })

  it('honours a caller-supplied classification map (database overrides)', () => {
    const rows = [
      row('2026-07-26', 'newlab/pending', 1000),
      row('2026-07-26', CLOSED, 1000),
      row('2026-07-26', 'other', 500),
    ]
    expect(computeOpenWeightShare(rows).unclassified).toEqual([
      'newlab/pending',
    ])

    const overridden = computeOpenWeightShare(rows, OPEN_WEIGHT_WINDOW_DAYS, {
      ...OPEN_WEIGHT_MODELS,
      'newlab/pending': { open: true, weights: 'newlab/pending-weights' },
    })
    expect(overridden.unclassified).toEqual([])
    expect(overridden.share).toBeCloseTo(50)
  })

  it('measures the unclassified share against classified tokens, not payload', () => {
    // `other` dwarfs everything, and must not dilute the ratio the cap reads.
    const rows = [
      row('2026-07-26', OPEN, 600),
      row('2026-07-26', CLOSED, 400),
      row('2026-07-26', 'newlab/unknown', 10),
      row('2026-07-26', 'other', 1_000_000),
    ]
    expect(
      computeOpenWeightShare(rows).unclassifiedShareOfClassified
    ).toBeCloseTo(0.01)
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
    // 1000 unknown against 7000 classified — 14%, far over the cap.
    rows.push(row('2026-07-26', 'newlab/unknown', 1000))
    const validation = validateOpenWeightPublication(
      computeOpenWeightShare(rows)
    )
    expect(validation.ok).toBe(false)
    if (!validation.ok)
      expect(validation.reason).toContain('unclassified models')
  })

  it('publishes under grace when the unknown is below the cap', () => {
    const rows = completeWindow()
    // 35 unknown against 7000 classified = 0.5%, inside the 1% cap.
    rows.push(row('2026-07-26', 'newlab/tiny-newcomer', 35))
    const result = computeOpenWeightShare(rows)
    const validation = validateOpenWeightPublication(result)

    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    // The index itself is untouched — the unknown is still out of both sides.
    expect(validation.share).toBeCloseTo(60)
    expect(validation.grace?.unclassified).toEqual(['newlab/tiny-newcomer'])
    expect(validation.grace?.shareOfClassified).toBeCloseTo(0.005)
    // 0.005 * max(0.6, 0.4) / 1.005 * 100 = 0.2985 points.
    expect(validation.grace?.maxIndexError).toBeCloseTo(0.2985, 3)
  })

  it('reports no grace at all when everything is classified', () => {
    const validation = validateOpenWeightPublication(
      computeOpenWeightShare(completeWindow())
    )
    expect(validation.ok).toBe(true)
    if (validation.ok) expect(validation.grace).toBeUndefined()
  })

  it('halts on a below-cap unknown once its grace window has expired', () => {
    const rows = completeWindow()
    rows.push(row('2026-07-26', 'newlab/tiny-newcomer', 35))
    const result = computeOpenWeightShare(rows)
    // Small enough to publish, but the operator says time is up.
    expect(validateOpenWeightPublication(result).ok).toBe(true)
    const validation = validateOpenWeightPublication(result, {
      expiredUnclassified: ['newlab/tiny-newcomer'],
    })
    expect(validation.ok).toBe(false)
    if (!validation.ok) expect(validation.reason).toContain('grace window')
  })

  it('halts on an expired unknown that only ever ranks as its :free variant', () => {
    // The grace rows are stored under base slugs, so an unknown reported as
    // `foo:free` has to match the expiry list's `foo` or the deadline never
    // fires and the model publishes under grace forever. This is not a
    // hypothetical shape — nemotron-3.5-lightning reached the top 50 as its
    // :free variant.
    const rows = completeWindow()
    rows.push(row('2026-07-26', 'newlab/tiny-newcomer:free', 35))
    const result = computeOpenWeightShare(rows)

    expect(result.unclassified).toEqual(['newlab/tiny-newcomer'])
    const validation = validateOpenWeightPublication(result, {
      expiredUnclassified: ['newlab/tiny-newcomer'],
    })
    expect(validation.ok).toBe(false)
    if (!validation.ok) expect(validation.reason).toContain('grace window')
  })

  it('reports one unknown when the same model ranks paid and :free', () => {
    const rows = completeWindow()
    rows.push(row('2026-07-26', 'newlab/tiny-newcomer', 20))
    rows.push(row('2026-07-26', 'newlab/tiny-newcomer:free', 15))
    const result = computeOpenWeightShare(rows)

    expect(result.unclassified).toEqual(['newlab/tiny-newcomer'])
    // Both variants' tokens still count toward the unclassified pressure.
    expect(result.unclassifiedShareOfClassified).toBeCloseTo(0.005)
  })

  it('restores halt-on-any-unknown when the cap is zero', () => {
    const rows = completeWindow()
    rows.push(row('2026-07-26', 'newlab/tiny-newcomer', 1))
    const validation = validateOpenWeightPublication(
      computeOpenWeightShare(rows),
      { unclassifiedShareCap: 0 }
    )
    expect(validation.ok).toBe(false)
  })

  it('bounds the real error a grace publication can cause', () => {
    // Property check of the documented bound: whatever side the unknown
    // actually falls on, the published index is within maxIndexError of it.
    const rows = completeWindow()
    rows.push(row('2026-07-26', 'newlab/tiny-newcomer', 35))
    const validation = validateOpenWeightPublication(
      computeOpenWeightShare(rows)
    )
    if (!validation.ok || !validation.grace) throw new Error('expected grace')

    const asOpen = computeOpenWeightShare(rows, OPEN_WEIGHT_WINDOW_DAYS, {
      ...OPEN_WEIGHT_MODELS,
      'newlab/tiny-newcomer': { open: true, weights: 'newlab/tiny' },
    }).share
    const asClosed = computeOpenWeightShare(rows, OPEN_WEIGHT_WINDOW_DAYS, {
      ...OPEN_WEIGHT_MODELS,
      'newlab/tiny-newcomer': { open: false },
    }).share

    for (const truth of [asOpen, asClosed]) {
      expect(truth).not.toBeNull()
      expect(
        Math.abs((truth as number) - validation.share)
      ).toBeLessThanOrEqual(validation.grace.maxIndexError + 1e-9)
    }
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
    // Assert on `weights` itself. The previous form interpolated the slug and
    // matched the pair against /.+\/.+/ — which the slug's OWN slash satisfies,
    // so it passed for an open entry citing nothing at all. Three comments in
    // this package describe it as the invariant that keeps an unevidenced open
    // call out of the list, so it needs to actually check.
    for (const [slug, c] of Object.entries(OPEN_WEIGHT_MODELS)) {
      if (c.open) {
        expect([slug, typeof c.weights]).toEqual([slug, 'string'])
        expect([slug, (c.weights ?? '').trim()]).not.toEqual([slug, ''])
        // owner/repo, and the owner is not the empty string
        expect([slug, c.weights]).toEqual([
          slug,
          expect.stringMatching(/^[^/\s]+\/[^/\s]+$/),
        ])
      } else {
        expect([slug, c.weights]).toEqual([slug, undefined])
      }
    }
  })

  it('that invariant actually fails on an unevidenced open entry', () => {
    // Guards the guard: if this ever passes, the assertion above went vacuous
    // again.
    const bad = { open: true } as (typeof OPEN_WEIGHT_MODELS)[string]
    expect(() =>
      expect(['x/y', typeof bad.weights]).toEqual(['x/y', 'string'])
    ).toThrow()
  })
})

describe('composite slugs (routers and floating aliases)', () => {
  const rows = (entries: [string, string][]) =>
    entries.map(([model_permaslug, total_tokens]) => ({
      date: '2026-08-20',
      model_permaslug,
      total_tokens,
    }))

  it('identifies routers and aliases, but not stealth models', () => {
    expect(isCompositeSlug('openrouter/fusion')).toBe(true)
    expect(isCompositeSlug('openrouter/auto-beta')).toBe(true)
    expect(isCompositeSlug('~z-ai/glm-latest')).toBe(true)
    expect(isCompositeSlug('~openai/gpt-latest')).toBe(true)
    // Cloaked pre-release models ARE single models and stay classifiable —
    // no suffix separates them from routers, which is why the list is
    // explicit. `auto-beta` is a router; `horizon-beta` is a model.
    expect(isCompositeSlug('openrouter/horizon-beta')).toBe(false)
    expect(isCompositeSlug('openrouter/owl-alpha')).toBe(false)
    expect(isCompositeSlug('z-ai/glm-5.3-20260816')).toBe(false)
  })

  it('keeps them out of both sides instead of halting the feed on them', () => {
    const classifications = {
      'a/open-model': { open: true, weights: 'a/Open' },
      'b/closed-model': { open: false },
    }
    const result = computeOpenWeightShare(
      rows([
        ['a/open-model', '700'],
        ['b/closed-model', '300'],
        ['openrouter/fusion', '500'],
        ['~z-ai/glm-latest', '100'],
      ]),
      1,
      classifications
    )
    // 700 / (700 + 300) — the router and alias touch neither side.
    expect(result.share).toBe(70)
    // And critically they are NOT unclassified, which is what would start a
    // grace clock and eventually halt publication.
    expect(result.unclassified).toEqual([])
    expect(result.compositeSlugs).toEqual([
      'openrouter/fusion',
      '~z-ai/glm-latest',
    ])
    expect(result.compositeTokens).toBe(600)
  })

  it('still treats an unknown ordinary model as unclassified', () => {
    const result = computeOpenWeightShare(
      rows([
        ['a/open-model', '700'],
        ['newlab/brand-new', '10'],
      ]),
      1,
      { 'a/open-model': { open: true, weights: 'a/Open' } }
    )
    expect(result.unclassified).toEqual(['newlab/brand-new'])
    expect(result.compositeSlugs).toEqual([])
  })
})

describe('isValidPermaslug', () => {
  it('rejects slash-containing keys that are not owner/model', () => {
    // Every one of these passed the old includes('/') check, and with the
    // CLI's --create flag could have been INSERTED as a classification row
    // that nothing in the index can ever match.
    for (const bad of ['/x', 'x/', '/', 'x//y', '', 'x', 'a/b/c', ' / '])
      expect([bad, isValidPermaslug(bad)]).toEqual([bad, false])
  })

  it('rejects whitespace-bearing keys that match no model', () => {
    // These pass a non-blank-segment check but correspond to nothing, and the
    // central upsert would persist them. They read as correct in a log line,
    // which is what makes them worth rejecting rather than tolerating.
    for (const bad of [
      'openai /gpt-4',
      'openai/ gpt-4',
      'openai/gpt 4',
      ' openai/gpt-4',
      'openai/gpt-4 ',
      'openai/gpt\t4',
    ])
      expect([bad, isValidPermaslug(bad)]).toEqual([bad, false])
  })

  it('accepts the real permaslug keys the index uses', () => {
    for (const good of [
      'z-ai/glm-5.3-20260816',
      'openai/gpt-4',
      'meta-llama/llama-3.3-70b-instruct',
      'inclusionai/ling-3.0-flash-20260723',
    ])
      expect([good, isValidPermaslug(good)]).toEqual([good, true])
  })

  it('agrees with basePermaslug on what it produces', () => {
    // basePermaslug truncates at ':', so a variant suffix must still normalise
    // to something this accepts -- otherwise the write path would reject keys
    // the read path generates.
    for (const raw of ['qwen/qwen3-max:free', 'z-ai/glm-5.3-20260816:nitro'])
      expect([raw, isValidPermaslug(basePermaslug(raw))]).toEqual([raw, true])
  })
})

describe('source freshness', () => {
  // 2026-09-02T10:00:00Z. Yesterday is the newest COMPLETE day upstream.
  const now = Date.UTC(2026, 8, 2, 10)
  const window = (newest: string) => {
    const rows: RankingRow[] = []
    const newestMs = Date.parse(`${newest}T00:00:00Z`)
    for (let i = 6; i >= 0; i--)
      rows.push(row(utcDateString(newestMs - i * DAY_MS), OPEN, 1))
    return rows
  }

  it('measures whole UTC days behind today', () => {
    expect(openRouterSourceLagDays('2026-09-01', now)).toBe(1)
    expect(openRouterSourceLagDays('2026-08-30', now)).toBe(3)
    expect(openRouterSourceLagDays('2026-09-02', now)).toBe(0)
    expect(openRouterSourceLagDays('2026-09-03', now)).toBe(-1)
    expect(openRouterSourceLagDays('nope', now)).toBeNull()
    // Impossible calendar dates are invalid, not rolled forward.
    expect(openRouterSourceLagDays('2026-02-31', now)).toBeNull()
    expect(openRouterSourceLagDays('2026-13-01', now)).toBeNull()
  })

  it('accepts yesterday, a late publish, and the documented maximum', () => {
    expect(OPENROUTER_MAX_SOURCE_LAG_DAYS).toBe(3)
    for (const newest of ['2026-09-01', '2026-08-31', '2026-08-30'])
      expect([
        newest,
        validateOpenRouterSourceFreshness({ rows: window(newest), now }),
      ]).toEqual([newest, null])
  })

  it('refuses a frozen dataset instead of re-stamping it as fresh', () => {
    // The failure this exists for: the same seven old days served forever
    // would otherwise be published hourly with a fresh ts and never trip the
    // staleness or trading gates.
    const reason = validateOpenRouterSourceFreshness({
      rows: window('2026-08-29'),
      now,
    })
    expect(reason).toContain('2026-08-29')
    expect(reason).toContain('stale')
  })

  it('refuses an empty, impossible-dated, or future-dated payload', () => {
    expect(validateOpenRouterSourceFreshness({ rows: [], now })).toContain(
      'no dated rows'
    )
    // '2026-09-31' sorts newest and does not exist; it must not be read as
    // October 1st.
    expect(
      validateOpenRouterSourceFreshness({
        rows: [...window('2026-09-01'), row('2026-09-31', OPEN, 1)],
        now,
      })
    ).toContain('not a valid date')
    expect(
      validateOpenRouterSourceFreshness({ rows: window('2026-09-03'), now })
    ).toContain('after today')
  })

  it('honours a caller-supplied bound', () => {
    expect(
      validateOpenRouterSourceFreshness({
        rows: window('2026-08-31'),
        now,
        maxLagDays: 1,
      })
    ).not.toBeNull()
  })
})
