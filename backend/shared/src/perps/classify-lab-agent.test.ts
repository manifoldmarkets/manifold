jest.mock('common/perps/open-weight-models', () => ({
  basePermaslug: (slug: string) => slug.split(':', 1)[0],
  isValidPermaslug: (slug: string) => /^[^/\s]+\/[^/\s]+$/.test(slug),
  isCompositeSlug: () => false,
}))
jest.mock('common/perps/lab-share', () => ({
  DEFAULT_LAB_SHARE_CLASSIFICATIONS: {
    chinese: {},
    nonChinese: {},
    chineseModels: {},
    nonChineseModels: {},
  },
  authorOfPermaslug: (slug: string) => slug.split('/', 1)[0],
}))

import {
  LabAgentSearch,
  finalizeLabVerdict,
  normalizeUrl,
} from './classify-lab-agent'

const searches: LabAgentSearch[] = [
  {
    query: 'stealth sonoma-sky-alpha revealed',
    results: [
      {
        title: 'Grok 4 Fast | xAI',
        url: 'https://x.ai/news/grok-4-fast/',
      },
      { title: 'OpenRouter changelog', url: 'https://openrouter.ai/changelog' },
    ],
  },
]

const finalize = (input: unknown, ran = searches) =>
  finalizeLabVerdict('model', 'stealth/sonoma-sky-alpha', input, ran)

describe('normalizeUrl', () => {
  test('canonicalises scheme, www, trailing slash and fragment but keeps the query', () => {
    expect(normalizeUrl('https://www.x.ai/news/grok-4-fast/#top')).toBe(
      'x.ai/news/grok-4-fast'
    )
    expect(normalizeUrl('http://X.AI/news/grok-4-fast')).toBe(
      'x.ai/news/grok-4-fast'
    )
    expect(normalizeUrl('https://example.com/a?b=1')).toBe('example.com/a?b=1')
  })

  test('rejects non-http URLs and garbage', () => {
    expect(normalizeUrl('ftp://example.com/x')).toBeNull()
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('not a url')).toBeNull()
    expect(normalizeUrl('')).toBeNull()
  })
})

describe('finalizeLabVerdict', () => {
  test('accepts a placement whose source URL came back from a search', () => {
    const result = finalize({
      verdict: 'non-chinese',
      publisher: 'xAI',
      headquarters: 'Palo Alto, US',
      sourceUrl: 'https://x.ai/news/grok-4-fast',
      reasoning: 'xAI announced the reveal.',
    })
    expect(result.verdict).toEqual({
      verdict: 'non-chinese',
      publisher: 'xAI',
      headquarters: 'Palo Alto, US',
      sourceUrl: 'https://x.ai/news/grok-4-fast',
      reasoning: 'xAI announced the reveal.',
    })
    expect(result.rejectedReason).toBeUndefined()
  })

  test('downgrades a placement whose URL no search returned — memory is not a source', () => {
    const result = finalize({
      verdict: 'chinese',
      publisher: 'Z.ai',
      headquarters: 'Beijing, China',
      sourceUrl: 'https://z.ai/about',
      reasoning: 'I recall this.',
    })
    expect(result.verdict.verdict).toBe('unresolved')
    expect(result.rejectedReason).toBe('uncited source URL: https://z.ai/about')
  })

  test('downgrades a placement with no publisher, headquarters or URL', () => {
    expect(
      finalize({ verdict: 'chinese', reasoning: 'x' }).rejectedReason
    ).toBe('placement missing publisher or headquarters')
    expect(
      finalize({
        verdict: 'chinese',
        publisher: 'Z.ai',
        headquarters: 'Beijing',
        sourceUrl: 'nope',
        reasoning: 'x',
      }).rejectedReason
    ).toBe('placement cited no source URL')
  })

  test('unattributed needs searches behind it, like a closed open-weight verdict', () => {
    expect(
      finalize({ verdict: 'unattributed', reasoning: 'nothing found' }).verdict
    ).toEqual({ verdict: 'unattributed', reasoning: 'nothing found' })
    const unsearched = finalize(
      { verdict: 'unattributed', reasoning: 'nothing found' },
      []
    )
    expect(unsearched.verdict.verdict).toBe('unresolved')
    expect(unsearched.rejectedReason).toBe(
      'unattributed verdict rested on no searches'
    )
  })

  test('tolerates a malformed submission', () => {
    expect(finalize(null).verdict).toEqual({
      verdict: 'unresolved',
      reasoning: '(none given)',
    })
    expect(finalize({ verdict: 42, reasoning: ['x'] }).verdict.verdict).toBe(
      'unresolved'
    )
  })

  test.each(['unattributed', 'unresolved'])(
    'retries %s when every web search failed',
    (verdict) => {
      const result = finalize({ verdict, reasoning: 'nothing found' }, [
        { query: 'publisher reveal', results: [], error: 'unavailable' },
        {
          query: 'publisher headquarters',
          results: [],
          error: 'too_many_requests',
        },
      ])
      expect(result.verdict.verdict).toBe('unresolved')
      expect(result.transient).toBe(true)
      expect(result.rejectedReason).toBe('no successful web search')
    }
  )

  test('a completed search with no matches can support unattributed', () => {
    const result = finalize(
      { verdict: 'unattributed', reasoning: 'no official attribution found' },
      [{ query: 'publisher reveal', results: [] }]
    )
    expect(result.verdict.verdict).toBe('unattributed')
    expect(result.transient).toBeUndefined()
  })
})
