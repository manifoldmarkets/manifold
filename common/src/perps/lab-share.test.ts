import {
  CHINESE_LAB_AUTHORS,
  KNOWN_NON_CHINESE_AUTHORS,
  UNKNOWN_AUTHOR_TOKEN_SHARE_CAP,
  authorOfPermaslug,
  computeAnthropicShare,
  computeChineseLabShare,
  computeLabShare,
  validateLabSharePublication,
} from './lab-share'
import {
  OPEN_WEIGHT_MODELS,
  OPEN_WEIGHT_WINDOW_DAYS,
  RankingRow,
  UNCLASSIFIED_TOKEN_SHARE_CAP,
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

const D = '2026-08-26'

describe('authorOfPermaslug', () => {
  it('is the segment before the first slash of the base slug', () => {
    expect(authorOfPermaslug('anthropic/claude-opus-5-20260723')).toBe(
      'anthropic'
    )
    expect(authorOfPermaslug('z-ai/glm-5.2-20260616')).toBe('z-ai')
    expect(authorOfPermaslug('meta-llama/llama-3.3-70b-instruct')).toBe(
      'meta-llama'
    )
  })

  it('collapses :free and other variants to the base author', () => {
    expect(authorOfPermaslug('deepseek/deepseek-r1:free')).toBe('deepseek')
    expect(authorOfPermaslug('qwen/qwen3-max:nitro')).toBe('qwen')
  })

  it('rejects malformed keys via isValidPermaslug', () => {
    for (const bad of ['other', '/x', 'x/', 'a/b/c', 'openai /gpt-4', ''])
      expect([bad, authorOfPermaslug(bad)]).toEqual([bad, null])
  })
})

describe('Anthropic share', () => {
  it('is Anthropic tokens over every classified token', () => {
    const rows = [
      row(D, 'anthropic/claude-opus-5-20260723', 300),
      row(D, 'openai/gpt-5.5-20260423', 500),
      row(D, 'deepseek/deepseek-v4-pro-20260423', 200),
    ]
    expect(computeAnthropicShare(rows).share).toBeCloseTo(30)
  })

  it('excludes `other` and composite slugs from the denominator', () => {
    const base = [
      row(D, 'anthropic/claude-opus-5-20260723', 300),
      row(D, 'openai/gpt-5.5-20260423', 700),
    ]
    const withExcluded = [
      ...base,
      row(D, 'other', 5000),
      row(D, 'openrouter/fusion', 400),
      row(D, '~z-ai/glm-latest', 100),
    ]
    const res = computeAnthropicShare(withExcluded)
    expect(res.share).toBe(computeAnthropicShare(base).share)
    expect(res.share).toBeCloseTo(30)
    expect(res.otherTokens).toBe(5000)
    expect(res.compositeTokens).toBe(500)
    expect(res.compositeSlugs).toEqual([
      'openrouter/fusion',
      '~z-ai/glm-latest',
    ])
    expect(res.hasExcludedPayload).toBe(true)
  })

  it('keeps cloaked openrouter/* slugs in the denominator, never the numerator', () => {
    const rows = [
      row(D, 'anthropic/claude-opus-5-20260723', 300),
      row(D, 'openrouter/horizon-beta', 700),
    ]
    const res = computeAnthropicShare(rows)
    expect(res.share).toBeCloseTo(30)
    expect(res.classifiedTokens).toBe(1000)
    expect(res.numeratorTokens).toBe(300)
  })

  it('has no unknown-author concept: every valid author is classified', () => {
    const rows = [
      row(D, 'anthropic/claude-opus-5-20260723', 300),
      row(D, 'brand-new-lab/model-1', 700),
    ]
    const res = computeAnthropicShare(rows)
    expect(res.unknownAuthors).toEqual([])
    expect(res.unknownTokens).toBe(0)
    expect(res.share).toBeCloseTo(30)
  })

  it('collapses :free variants into the same author', () => {
    const rows = [
      row(D, 'anthropic/claude-4.5-haiku-20251001', 100),
      row(D, 'anthropic/claude-4.5-haiku-20251001:free', 100),
      row(D, 'openai/gpt-oss-120b:free', 200),
    ]
    expect(computeAnthropicShare(rows).share).toBeCloseTo(50)
  })

  it('counts the author exactly, not by substring', () => {
    const rows = [
      row(D, 'anthropic/claude-opus-5-20260723', 100),
      row(D, 'not-anthropic/claude-clone', 100),
      row(D, 'anthropic-ai/other-thing', 100),
    ]
    expect(computeAnthropicShare(rows).share).toBeCloseTo(100 / 3)
  })
})

describe('Chinese-lab share', () => {
  it('is Chinese-lab tokens over every classified token', () => {
    const rows = [
      row(D, 'deepseek/deepseek-v4-pro-20260423', 250),
      row(D, 'qwen/qwen3.7-flash-20260727', 250),
      row(D, 'anthropic/claude-opus-5-20260723', 300),
      row(D, 'openai/gpt-5.5-20260423', 200),
    ]
    const res = computeChineseLabShare(rows)
    expect(res.share).toBeCloseTo(50)
    expect(res.unknownAuthors).toEqual([])
  })

  it('excludes an unknown author from both sides and reports it', () => {
    const rows = [
      row(D, 'deepseek/deepseek-v4-pro-20260423', 500),
      row(D, 'openai/gpt-5.5-20260423', 500),
      row(D, 'mystery-lab/model-x', 100_000),
    ]
    const res = computeChineseLabShare(rows)
    // A huge unknown must not drag the index toward either side.
    expect(res.share).toBeCloseTo(50)
    expect(res.unknownAuthors).toEqual(['mystery-lab'])
    expect(res.unknownTokens).toBe(100_000)
    expect(res.classifiedTokens).toBe(1000)
    expect(res.unknownShareOfClassified).toBeCloseTo(100)
  })

  it('reports one unknown author across its :free variant and several models', () => {
    const rows = [
      row(D, 'deepseek/deepseek-v4-pro-20260423', 500),
      row(D, 'openai/gpt-5.5-20260423', 500),
      row(D, 'mystery-lab/model-x', 3),
      row(D, 'mystery-lab/model-x:free', 2),
      row(D, 'mystery-lab/model-y', 1),
    ]
    const res = computeChineseLabShare(rows)
    expect(res.unknownAuthors).toEqual(['mystery-lab'])
    expect(res.unknownTokens).toBe(6)
    expect(res.unknownShareOfClassified).toBeCloseTo(0.006)
  })

  it('honours caller-supplied author lists', () => {
    const rows = [
      row(D, 'mystery-lab/model-x', 500),
      row(D, 'openai/gpt-5.5-20260423', 500),
    ]
    expect(computeChineseLabShare(rows).unknownAuthors).toEqual(['mystery-lab'])
    const placed = computeChineseLabShare(rows, OPEN_WEIGHT_WINDOW_DAYS, {
      chinese: { ...CHINESE_LAB_AUTHORS, 'mystery-lab': { evidence: 'test' } },
      nonChinese: KNOWN_NON_CHINESE_AUTHORS,
    })
    expect(placed.unknownAuthors).toEqual([])
    expect(placed.share).toBeCloseTo(50)
  })

  it('keeps cloaked openrouter/* slugs in the denominator, never the numerator', () => {
    const rows = [
      row(D, 'deepseek/deepseek-v4-pro-20260423', 300),
      row(D, 'openrouter/horizon-beta', 700),
    ]
    const res = computeChineseLabShare(rows)
    expect(res.unknownAuthors).toEqual([])
    expect(res.share).toBeCloseTo(30)
  })
})

describe('publication validation', () => {
  const completeWindow = (extra: RankingRow[] = []) => {
    const rows: RankingRow[] = []
    for (let day = 20; day <= 26; day++) {
      const date = `2026-08-${day}`
      rows.push(row(date, 'anthropic/claude-opus-5-20260723', 300))
      rows.push(row(date, 'deepseek/deepseek-v4-pro-20260423', 400))
      rows.push(row(date, 'openai/gpt-5.5-20260423', 300))
      rows.push(row(date, 'other', 1000))
    }
    return [...rows, ...extra]
  }

  it('accepts a complete, classified payload for both feeds', () => {
    expect(
      validateLabSharePublication(computeAnthropicShare(completeWindow()))
    ).toEqual({
      ok: true,
      share: 30,
      unknownAuthors: [],
      unknownShareOfClassified: 0,
    })
    expect(
      validateLabSharePublication(computeChineseLabShare(completeWindow()))
    ).toEqual({
      ok: true,
      share: 40,
      unknownAuthors: [],
      unknownShareOfClassified: 0,
    })
  })

  it('refuses the Chinese-lab feed when unknown authors exceed the cap', () => {
    // 1000 unknown against 7000 classified — 14%, far over the 1% cap.
    const res = computeChineseLabShare(
      completeWindow([row(D, 'mystery-lab/model-x', 1000)])
    )
    const validation = validateLabSharePublication(res)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.reason).toContain('mystery-lab')
    expect(validation.reason).toContain('CHINESE_LAB_AUTHORS')
    expect(validation.reason).toContain('KNOWN_NON_CHINESE_AUTHORS')
  })

  it('publishes the Chinese-lab feed under the cap and names the unknown', () => {
    // 35 unknown against 7000 classified = 0.5%, inside the 1% cap.
    const res = computeChineseLabShare(
      completeWindow([row(D, 'mystery-lab/model-x', 35)])
    )
    const validation = validateLabSharePublication(res)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.share).toBeCloseTo(40)
    expect(validation.unknownAuthors).toEqual(['mystery-lab'])
    expect(validation.unknownShareOfClassified).toBeCloseTo(0.005)
  })

  it('halts on any unknown when the cap is zero (backfill posture)', () => {
    const res = computeChineseLabShare(
      completeWindow([row(D, 'mystery-lab/model-x', 1)])
    )
    expect(validateLabSharePublication(res, { unknownShareCap: 0 }).ok).toBe(
      false
    )
  })

  it('an unknown author never affects the Anthropic feed', () => {
    const res = computeAnthropicShare(
      completeWindow([row(D, 'mystery-lab/model-x', 1_000_000)])
    )
    const validation = validateLabSharePublication(res)
    expect(validation.ok).toBe(true)
    if (validation.ok) expect(validation.unknownAuthors).toEqual([])
  })

  it('fails closed on an incomplete or gapped window for both feeds', () => {
    const short = completeWindow().filter((r) => r.date !== '2026-08-20')
    for (const feed of ['anthropic', 'chinese-lab'] as const) {
      const validation = validateLabSharePublication(
        computeLabShare(feed, short)
      )
      expect(validation.ok).toBe(false)
      if (!validation.ok) expect(validation.reason).toContain('incomplete')
    }
    const gapped = completeWindow().filter((r) => r.date !== '2026-08-23')
    gapped.push(row('2026-08-27', 'anthropic/claude-opus-5-20260723', 1))
    gapped.push(row('2026-08-27', 'other', 1))
    const gapValidation = validateLabSharePublication(
      computeAnthropicShare(gapped)
    )
    expect(gapValidation.ok).toBe(false)
    if (!gapValidation.ok)
      expect(gapValidation.reason).toContain('non-consecutive')
  })

  it('fails closed on malformed rows for both feeds', () => {
    const badTokens = completeWindow([
      row(D, 'openai/gpt-5.5-20260423', 'not-a-number'),
    ])
    const badSlug = completeWindow([row(D, 'a/b/c', 10)])
    for (const feed of ['anthropic', 'chinese-lab'] as const) {
      const tokens = validateLabSharePublication(
        computeLabShare(feed, badTokens)
      )
      expect(tokens.ok).toBe(false)
      if (!tokens.ok) expect(tokens.reason).toContain('malformed token')
      const slug = validateLabSharePublication(computeLabShare(feed, badSlug))
      expect(slug.ok).toBe(false)
      if (!slug.ok) expect(slug.reason).toContain('malformed model slugs')
    }
  })

  it('rejects a window with no `other` row', () => {
    const noOther = completeWindow().filter(
      (r) => r.model_permaslug !== 'other'
    )
    expect(validateLabSharePublication(computeAnthropicShare(noOther)).ok).toBe(
      false
    )
  })

  it('returns null rather than 0 when nothing is classified', () => {
    expect(computeAnthropicShare([row(D, 'other', 100)]).share).toBeNull()
    expect(computeChineseLabShare([]).share).toBeNull()
  })

  it('sums past Number.MAX_SAFE_INTEGER without losing units', () => {
    const big = '9007199254740993'
    const rows = [
      row(D, 'anthropic/claude-opus-5-20260723', big),
      row(D, 'openai/gpt-5.5-20260423', big),
    ]
    expect(computeAnthropicShare(rows).share).toBeCloseTo(50)
  })
})

describe('the author lists', () => {
  it('reuse the open-weight cap number', () => {
    expect(UNKNOWN_AUTHOR_TOKEN_SHARE_CAP).toBe(UNCLASSIFIED_TOKEN_SHARE_CAP)
  })

  it('never place an author on both sides', () => {
    for (const author of Object.keys(CHINESE_LAB_AUTHORS))
      expect([author, KNOWN_NON_CHINESE_AUTHORS[author]]).toEqual([
        author,
        undefined,
      ])
  })

  it('carry evidence for every entry', () => {
    for (const [author, entry] of [
      ...Object.entries(CHINESE_LAB_AUTHORS),
      ...Object.entries(KNOWN_NON_CHINESE_AUTHORS),
    ]) {
      expect([author, entry.evidence.trim().length > 0]).toEqual([author, true])
      // Keyed on a bare author segment, never a slug.
      expect([author, author.includes('/')]).toEqual([author, false])
    }
  })

  it('cover every author in the open-weight seed list except the ones the header names', () => {
    // "unknown" must mean genuinely new. The single deliberate omission is
    // nex-agi, whose headquarters is left for a human to place.
    const seedAuthors = new Set(
      Object.keys(OPEN_WEIGHT_MODELS).map((slug) =>
        slug.slice(0, slug.indexOf('/'))
      )
    )
    const unplaced = [...seedAuthors].filter(
      (author) =>
        !CHINESE_LAB_AUTHORS[author] && !KNOWN_NON_CHINESE_AUTHORS[author]
    )
    expect(unplaced).toEqual(['nex-agi'])
  })

  it('classify Anthropic as non-Chinese and the seed Chinese labs as Chinese', () => {
    expect(KNOWN_NON_CHINESE_AUTHORS.anthropic).toBeDefined()
    for (const author of [
      'qwen',
      'deepseek',
      'z-ai',
      'moonshotai',
      'xiaomi',
      'minimax',
      'inclusionai',
      'tencent',
      'stepfun',
      'bytedance-seed',
      'baai',
      'alibaba',
      'kwaipilot',
    ])
      expect([author, CHINESE_LAB_AUTHORS[author]]).toBeDefined()
  })
})
