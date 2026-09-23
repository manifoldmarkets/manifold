import {
  getManifoldMarketEmbedUrl,
  getMarketUrlFromManifoldEmbedUrl,
  matchManifoldMarketUrl,
} from './manifold-url'

describe('getManifoldMarketEmbedUrl', () => {
  test.each([
    [
      'https://manifold.markets/alice/will-it-rain',
      'https://manifold.markets/embed/alice/will-it-rain',
    ],
    [
      'https://dev.manifold.markets/alice/will-it-rain?ref=test',
      'https://dev.manifold.markets/embed/alice/will-it-rain',
    ],
    [
      'https://preview.manifold.markets/alice/will-it-rain',
      'https://preview.manifold.markets/embed/alice/will-it-rain',
    ],
    [
      'http://localhost:3000/alice/will-it-rain',
      'http://localhost:3000/embed/alice/will-it-rain',
    ],
    [
      'https://manifold.love/alice/will-it-rain',
      'https://manifold.love/embed/alice/will-it-rain',
    ],
    [
      'https://manifold.markets/embed/alice/will-it-rain',
      'https://manifold.markets/embed/alice/will-it-rain',
    ],
  ])('preserves the market environment for %s', (input, expected) => {
    expect(getManifoldMarketEmbedUrl(input)).toBe(expected)
  })

  it('accepts the current deployment origin for preview environments', () => {
    const previewOrigin =
      'https://mantic-git-perps-launch-manifoldmarkets.vercel.app'
    expect(
      getManifoldMarketEmbedUrl(
        `${previewOrigin}/alice/will-it-rain`,
        previewOrigin
      )
    ).toBe(`${previewOrigin}/embed/alice/will-it-rain`)
  })

  test.each([
    'https://example.com/alice/will-it-rain',
    'javascript://manifold.markets/alice/will-it-rain',
    'https://manifold.markets/alice',
    'https://manifold.markets/alice/not_a_market_slug',
    'https://manifold.markets/alice/will-it-rain/extra',
  ])('rejects non-market or untrusted URLs: %s', (input) => {
    expect(getManifoldMarketEmbedUrl(input)).toBeNull()
  })
})

describe('matchManifoldMarketUrl', () => {
  it('returns the market identity and source origin', () => {
    expect(
      matchManifoldMarketUrl('https://dev.manifold.markets/creator/perp-market')
    ).toEqual({
      username: 'creator',
      slug: 'perp-market',
      origin: 'https://dev.manifold.markets',
    })
  })
})

describe('getMarketUrlFromManifoldEmbedUrl', () => {
  test.each([
    [
      'https://manifold.markets/embed/alice/will-it-rain',
      'https://manifold.markets/alice/will-it-rain',
    ],
    [
      'https://dev.manifold.markets/embed/alice/will-it-rain?ref=test#chart',
      'https://dev.manifold.markets/alice/will-it-rain?ref=test#chart',
    ],
    [
      'http://localhost:3000/embed/alice/will-it-rain',
      'http://localhost:3000/alice/will-it-rain',
    ],
  ])('builds the click-through market URL for %s', (input, expected) => {
    expect(getMarketUrlFromManifoldEmbedUrl(input)).toBe(expected)
  })

  test.each([
    'https://manifold.markets/alice/will-it-rain',
    'https://example.com/manifold.markets/embed/alice/will-it-rain',
    'data:text/html,https://manifold.markets/embed/alice/will-it-rain',
  ])(
    'does not identify unrelated iframe URLs as Manifold embeds: %s',
    (input) => {
      expect(getMarketUrlFromManifoldEmbedUrl(input)).toBeNull()
    }
  )
})
