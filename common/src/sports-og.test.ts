import { selectSportsOgMarket } from './sports-og'

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
