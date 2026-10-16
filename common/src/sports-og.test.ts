import {
  formatSportsOgAsOf,
  parseSportsOgMarket,
  selectSportsOgMarket,
  sportsOgImageAlt,
} from './sports-og'
import { selectFeaturedGame } from './sports-game-feed'

const NOW = Date.parse('2026-10-16T02:30:00Z')
const game = (overrides = {}) => ({
  id: 'game-a',
  question: 'Panthers at Eagles, Oct 18 [official]',
  league: 'NFL',
  status: 'upcoming' as const,
  startTime: NOW + 60_000,
  closeTime: NOW + 3_600_000,
  isResolved: false,
  volume: 100,
  home: { name: 'Philadelphia Eagles', prob: 0.37 },
  away: { name: 'Carolina Panthers', prob: 0.63 },
  draw: null,
  ...overrides,
})
const snapshot = (games: unknown[]) => ({ snapshotTime: NOW, games })

it('selects the same featured game as a new sports-page visit, with real odds', () => {
  const games = [game(), game({ id: 'popular', volume: 200 })]
  const market = selectSportsOgMarket(snapshot(games), NOW)
  expect(market?.id).toBe(selectFeaturedGame(games)?.id)
  expect(market?.outcomes).toEqual([
    { name: 'Carolina Panthers', prob: 0.63 },
    { name: 'Philadelphia Eagles', prob: 0.37 },
  ])
  expect(market?.question).toBe(games[1].question)
  expect(market?.asOf).toBe(NOW)
})

it('promotes a live game above a more heavily traded upcoming game', () => {
  const games = [game({ volume: 10000 }), game({ id: 'live', status: 'live' })]
  expect(selectSportsOgMarket(snapshot(games), NOW)?.id).toBe('live')
})

it('keeps soccer home/away ordering and includes the draw probability', () => {
  const soccer = game({
    league: 'Premier League',
    home: { name: 'Arsenal', prob: 0.5 },
    away: { name: 'Chelsea', prob: 0.3 },
    draw: { prob: 0.2 },
  })
  expect(selectSportsOgMarket(snapshot([soccer]), NOW)?.outcomes).toEqual([
    { name: 'Arsenal', prob: 0.5 },
    { name: 'Chelsea', prob: 0.3 },
    { name: 'Draw', prob: 0.2 },
  ])
})

it.each([
  { isResolved: true },
  { closeTime: NOW },
  { status: 'finished' },
  { startTime: NaN },
  { home: { name: 'Invalid', prob: NaN } },
  { away: { name: 'Invalid', prob: Infinity } },
  { away: { name: 'Invalid', prob: -0.1 } },
  { draw: { prob: 1.1 } },
  { home: null },
])('skips an unavailable or invalid market: %j', (overrides) => {
  const games = [game({ ...overrides, volume: 10000 }), game({ id: 'valid' })]
  expect(selectSportsOgMarket(snapshot(games), NOW)?.id).toBe('valid')
})

it('handles zero and one probabilities without substituting example prices', () => {
  const market = selectSportsOgMarket(
    snapshot([
      game({
        home: { name: 'Home', prob: 1 },
        away: { name: 'Away', prob: 0 },
      }),
    ]),
    NOW
  )
  expect(market?.outcomes.map((outcome) => outcome.prob)).toEqual([0, 1])
  expect(sportsOgImageAlt(market)).toContain('Away 0%, Home 100%')
})

it.each([
  null,
  {},
  { snapshotTime: NOW, games: [] },
  { games: [game()] },
  { snapshotTime: NOW - 11 * 60_000, games: [game()] },
  { snapshotTime: NOW + 2 * 60_000, games: [game()] },
])(
  'uses the artwork fallback for missing or stale schedules: %j',
  (response) => {
    expect(selectSportsOgMarket(response, NOW)).toBeNull()
  }
)

it('preserves the snapshot across the image URL round-trip', () => {
  const market = selectSportsOgMarket(snapshot([game()]), NOW)
  const url = new URL('https://manifold.markets/api/og/sports')
  url.searchParams.set('market', JSON.stringify(market))
  expect(parseSportsOgMarket(url.searchParams.get('market'))).toEqual(market)
  expect(sportsOgImageAlt(market)).toContain('Carolina Panthers 63%')
  expect(sportsOgImageAlt(market)).toContain(formatSportsOgAsOf(NOW))
  expect(formatSportsOgAsOf(NOW)).toBe('Oct 16, 2026, 02:30 UTC')
})

it.each([null, '{', 'x'.repeat(2401), '{"outcomes":[]}'])(
  'rejects invalid image input',
  (value) => {
    expect(parseSportsOgMarket(value)).toBeNull()
  }
)

it('rejects malformed odds and timestamps in the public image URL', () => {
  const market = selectSportsOgMarket(snapshot([game()]), NOW)
  expect(
    parseSportsOgMarket(JSON.stringify({ ...market, asOf: 1e20 }))
  ).toBeNull()
  expect(
    parseSportsOgMarket(
      JSON.stringify({
        ...market,
        outcomes: [
          { name: 'A', prob: 2 },
          { name: 'B', prob: 0 },
        ],
      })
    )
  ).toBeNull()
})
