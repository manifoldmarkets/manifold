jest.mock('common/perps/open-weight-models', () => {
  const basePermaslug = (slug: string) => slug.split(':', 1)[0]
  const routerKeys = ['openrouter/auto', 'openrouter/auto-beta']
  return {
    basePermaslug,
    isValidPermaslug: (slug: string) => /^[^/\s]+\/[^/\s]+$/.test(slug),
    isCompositeSlug: (slug: string) =>
      slug.startsWith('~') || routerKeys.includes(basePermaslug(slug)),
  }
})

jest.mock('common/perps/lab-share', () => ({
  DEFAULT_LAB_SHARE_CLASSIFICATIONS: {
    chinese: {},
    nonChinese: {},
    chineseModels: {},
    nonChineseModels: {},
  },
  authorOfPermaslug: (slug: string) => {
    const base = slug.split(':', 1)[0]
    return /^[^/\s]+\/[^/\s]+$/.test(base) ? base.split('/', 1)[0] : null
  },
}))

import {
  LabClassificationRow,
  mergeLabClassificationRows,
  normalizeLabClassificationSubject,
  pendingLabSubjectsFromCatalog,
  validateLabClassificationWrite,
} from './lab-classifications'

const evidence = (value: string) => ({ evidence: value })

const row = (
  overrides: Partial<LabClassificationRow> &
    Pick<LabClassificationRow, 'subject_type' | 'subject_slug' | 'is_chinese'>
): LabClassificationRow => ({
  source: 'admin',
  evidence: evidence('database decision'),
  first_seen: '2026-09-01T00:00:00.000Z',
  first_ranked_at: null,
  classified_at:
    overrides.is_chinese === null ? null : '2026-09-02T00:00:00.000Z',
  classified_by: overrides.is_chinese === null ? null : 'operator-id',
  updated_time: '2026-09-02T00:00:00.000Z',
  ...overrides,
})

describe('lab classification resolution', () => {
  const seed: NonNullable<Parameters<typeof mergeLabClassificationRows>[1]> = {
    chinese: { 'seed-cn': evidence('seed Chinese author') },
    nonChinese: { 'seed-us': evidence('seed non-Chinese author') },
    chineseModels: {
      'stealth/known': evidence('seed exact Chinese model'),
    },
    nonChineseModels: {},
  }

  test('normalizes model variants and rejects unusable subject keys', () => {
    expect(normalizeLabClassificationSubject('author', ' nex-agi ')).toBe(
      'nex-agi'
    )
    expect(normalizeLabClassificationSubject('model', 'stealth/new:free')).toBe(
      'stealth/new'
    )
    expect(() => normalizeLabClassificationSubject('author', 'x/y')).toThrow(
      'malformed OpenRouter author'
    )
    expect(() => normalizeLabClassificationSubject('model', 'x/')).toThrow(
      'malformed OpenRouter model'
    )
    expect(() =>
      normalizeLabClassificationSubject('model', 'openrouter/auto')
    ).toThrow('composite OpenRouter model')
  })

  test('keeps seed verdicts and only accepts exact DB rows in model-scoped namespaces', () => {
    const merged = mergeLabClassificationRows(
      [
        row({
          subject_type: 'author',
          subject_slug: 'seed-cn',
          is_chinese: false,
        }),
        row({
          subject_type: 'model',
          subject_slug: 'stealth/known',
          is_chinese: false,
        }),
        row({
          subject_type: 'model',
          subject_slug: 'seed-cn/exception',
          is_chinese: false,
        }),
        row({
          subject_type: 'model',
          subject_slug: 'stealth/new',
          is_chinese: false,
        }),
        row({
          subject_type: 'author',
          subject_slug: 'new-lab',
          is_chinese: true,
        }),
        row({
          subject_type: 'author',
          subject_slug: 'still-pending',
          is_chinese: null,
        }),
      ],
      seed
    )

    expect(merged.chinese['seed-cn']).toEqual(evidence('seed Chinese author'))
    expect(merged.chineseModels['stealth/known']).toEqual(
      evidence('seed exact Chinese model')
    )
    expect(merged.nonChineseModels['seed-cn/exception']).toBeUndefined()
    expect(merged.nonChineseModels['stealth/new']).toEqual(
      evidence('database decision')
    )
    expect(merged.chinese['new-lab']).toEqual(evidence('database decision'))
    expect(merged.chinese['still-pending']).toBeUndefined()
    expect(merged.nonChinese['still-pending']).toBeUndefined()
  })

  test('write validation prevents broad shared-author and narrow ordinary-author verdicts', () => {
    expect(
      validateLabClassificationWrite('model', 'stealth/new', seed)
    ).toEqual({ ok: true, subjectSlug: 'stealth/new' })
    expect(validateLabClassificationWrite('author', 'stealth', seed)).toEqual({
      ok: false,
      reason:
        'author stealth is intentionally model-scoped; classify its individual model instead',
    })
    expect(
      validateLabClassificationWrite('model', 'seed-cn/exception', seed)
    ).toEqual({
      ok: false,
      reason:
        'author seed-cn is author-scoped; an exact-model verdict could override its author classification',
    })
  })

  test('merges prototype-named DB authors as own classification keys', () => {
    const merged = mergeLabClassificationRows(
      [
        row({
          subject_type: 'author',
          subject_slug: '__proto__',
          is_chinese: true,
        }),
      ],
      seed
    )

    expect(
      Object.prototype.hasOwnProperty.call(merged.chinese, '__proto__')
    ).toBe(true)
    expect(merged.chinese['__proto__']).toEqual(evidence('database decision'))
  })

  test('catalog discovery queues exact models for model-scoped authors', () => {
    const pending = pendingLabSubjectsFromCatalog(
      [
        { permaslug: 'seed-cn/model', name: 'Already covered' },
        { permaslug: 'stealth/known', name: 'Known reveal' },
        { permaslug: 'stealth/new:free', name: 'Anonymous preview' },
        { permaslug: 'new-lab/one', name: 'One' },
        { permaslug: 'new-lab/two', name: 'Two' },
        { permaslug: 'malformed', name: 'Bad row' },
      ],
      seed
    )

    expect(pending).toEqual([
      {
        subjectType: 'model',
        subjectSlug: 'stealth/new',
        evidence: {
          discoveredVia: 'catalog',
          openRouterName: 'Anonymous preview',
        },
      },
      {
        subjectType: 'author',
        subjectSlug: 'new-lab',
        evidence: {
          discoveredVia: 'catalog',
          relatedPermaslugs: ['new-lab/one', 'new-lab/two'],
          openRouterNames: ['One', 'Two'],
        },
      },
    ])
  })
})
