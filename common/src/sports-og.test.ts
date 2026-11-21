import { selectSportsOgMarket, sportsOgOutcomeName } from './sports-og'

// getStaticProps rejects undefined values, which would fail the /sports build.
test('the preview snapshot survives JSON unchanged', () => {
  const now = Date.UTC(2026, 9, 17)
  const team = (name: string, prob: number) => ({
    name,
    shortName: name, // Full names (college teams) can exceed the 24-char limit
    color: '#123456',
    prob,
  })
  const market = selectSportsOgMarket(
    {
      snapshotTime: now,
      games: [
        {
          id: 'g',
          question: 'Appalachian State at Coastal Carolina',
          league: 'College Football',
          status: 'live',
          startTime: now - 3_600_000,
          closeTime: now + 3_600_000,
          isResolved: false,
          volume: 10,
          home: team('Coastal Carolina Chanticleers', 0.55),
          away: team('Appalachian State Mountaineers', 0.45),
          draw: null,
        },
      ],
    },
    now
  )
  expect(market?.live).toBe(true)
  expect(market).toStrictEqual(JSON.parse(JSON.stringify(market)))
})

// A truncated spread label must never look like an outright-win probability.
test.each([
  ['Appalachian State Mountaineers (+3.5)', '(+3.5)'],
  ['South Carolina State Bulldogs (-3.5)', '(-3.5)'],
  ['A very long basketball team name (+12)', '(+12)'],
  ['A very long basketball team name (-12.25)', '(-12.25)'],
  ['A very long basketball team name +3.5', '+3.5'],
  ['A very long basketball team name −3.5', '−3.5'],
  ['A very long basketball team name (−3.5)', '(−3.5)'],
  ['A'.repeat(113) + ' (+3.5)', '(+3.5)'],
])('keeps the signed handicap when shortening %s', (name, handicap) => {
  const label = sportsOgOutcomeName(name)
  expect(label.length).toBeLessThanOrEqual(30)
  expect(label).toContain('…')
  expect(label.endsWith(' ' + handicap)).toBe(true)
})

test.each(['Knicks (+3.5)', '76ers -3.5', 'Draw', 'Chicago Bears'])(
  'keeps a short outcome label unchanged: %s',
  (name) => expect(sportsOgOutcomeName(name)).toBe(name)
)

test('keeps the existing shortening for ordinary moneyline names', () => {
  expect(sportsOgOutcomeName('South Carolina State Bulldogs')).toBe(
    'South Carolina State Bulldogs'
  )
  expect(sportsOgOutcomeName('A very long ordinary moneyline team name')).toBe(
    'A very long ordinary moneylin…'
  )
})
