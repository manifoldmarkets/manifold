import { API } from './api/schema'
import {
  canDefaultToForYou,
  getInitialBrowseForYou,
  hasEnoughBrowseHistory,
  normalizeBrowseChange,
  readBrowseMode,
  readBrowseParameters,
} from './browse-personalization'

describe('Browse personalization readiness', () => {
  it.each([0, 1, 19, NaN, Infinity, -Infinity])(
    'does not auto-select with insufficient/invalid history: %s',
    (views) => expect(hasEnoughBrowseHistory(views, true)).toBe(false)
  )

  it('requires both 20 distinct opened markets and learned interests', () => {
    expect(hasEnoughBrowseHistory(20, true)).toBe(true)
    expect(hasEnoughBrowseHistory(100, true)).toBe(true)
    expect(hasEnoughBrowseHistory(100, false)).toBe(false)
  })

  it('keeps the readiness endpoint private and scoped to the caller', () => {
    const endpoint = API['get-browse-personalization']
    expect(endpoint.authed).toBe(true)
    expect(endpoint.cache).toBe('private, no-store')
    expect(endpoint.props.safeParse({}).success).toBe(true)
    expect(endpoint.props.safeParse({ userId: 'another-user' }).success).toBe(
      false
    )
  })
})

describe('initial Browse destination', () => {
  const initial = (
    overrides: Partial<Parameters<typeof getInitialBrowseForYou>[0]>
  ) =>
    getInitialBrowseForYou({
      params: { fy: '0', s: 'score', sw: '0' },
      urlParams: {},
      eligible: true,
      ...overrides,
    })

  it('promotes automatic All on a later visit once enough history exists', () => {
    expect(initial({ eligible: false })).toBe('0')
    expect(initial({ eligible: true })).toBe('1')
  })

  it('keeps explicit All and lets cold-start users manually select For You', () => {
    expect(initial({ preference: 'all' })).toBe('0')
    expect(initial({ preference: 'for-you', eligible: false })).toBe('1')
  })

  it('gives explicit URLs priority over the remembered mode', () => {
    expect(initial({ urlParams: { fy: '0' }, preference: 'for-you' })).toBe('0')
    expect(
      initial({ urlParams: { fy: '1' }, preference: 'all', eligible: false })
    ).toBe('1')
  })

  it.each([
    { tf: 'followed' },
    { tf: 'science' },
    { gids: 'topic-a,topic-b' },
    { q: 'fusion' },
    { s: 'newest' },
    { s: '24-hour-vol' },
    { f: 'news' },
    { sw: '1' },
  ])('preserves an explicit destination/filter %j', (params) => {
    expect(initial({ params })).toBe('0')
  })

  it.each(['score', 'freshness-score'])(
    'supports personalization with %s',
    (s) => {
      expect(canDefaultToForYou({ s, sw: '0' })).toBe(true)
      expect(initial({ params: { s } })).toBe('1')
    }
  )

  it('ignores malformed local preferences and query arrays', () => {
    expect(readBrowseMode('treatment')).toBeUndefined()
    expect(readBrowseMode({ mode: 'all' })).toBeUndefined()
    expect(readBrowseParameters(['fy', '1'])).toEqual({})
    expect(readBrowseParameters({ fy: ['1'], tf: 'followed', n: 1 })).toEqual({
      tf: 'followed',
    })
  })
})

describe('Browse navigation', () => {
  const current = { fy: '1', tf: '', gids: '', s: 'score', f: 'all', sw: '0' }

  it('exits personalization when selecting All or Followed', () => {
    expect(
      normalizeBrowseChange(current, { fy: '0', tf: '', gids: '' }).fy
    ).toBe('0')
    expect(
      normalizeBrowseChange(current, { tf: 'followed', gids: '' }).fy
    ).toBe('0')
  })

  it('exits personalization for specific topics, New, news, or cash', () => {
    for (const changes of [
      { tf: 'science' },
      { gids: 'topic-a' },
      { s: 'newest' },
      { f: 'news' },
      { sw: '1' },
    ]) {
      expect(normalizeBrowseChange(current, changes).fy).toBe('0')
    }
  })

  it('preserves For You when switching between Best and Hot', () => {
    expect(normalizeBrowseChange(current, { s: 'freshness-score' })).toEqual({
      s: 'freshness-score',
    })
  })

  it('clears Followed and restores a supported sort when selecting For You', () => {
    expect(
      normalizeBrowseChange(
        {
          ...current,
          fy: '0',
          tf: 'followed',
          s: 'newest',
          f: 'news',
          sw: '1',
        },
        { fy: '1' }
      )
    ).toEqual({ fy: '1', tf: '', gids: '', s: 'score', f: 'open', sw: '0' })
  })
})
