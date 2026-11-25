import {
  SPORTS_GAME_BASE_ANTE,
  SPORTS_KICKOFF_BUDGET,
  SportsOpeningLine,
  chooseSportsGameAnte,
  isGoodOpeningLine,
} from './sports-kickoff-interface'

const line: SportsOpeningLine = {
  source: 'books',
  probs: [0.4, 0.6],
  bookCount: 1,
  vendors: ['book'],
  sampledTime: 1,
}
const live = { line, enabled: true, startKnown: true, mode: 'live' as const }
const base = (
  options: Parameters<typeof chooseSportsGameAnte>[0],
  ante = SPORTS_GAME_BASE_ANTE as number
) => {
  const result = chooseSportsGameAnte(options)
  expect(result.ante).toBe(ante)
  expect(result.kickoffBudget).toBeUndefined()
}

it('uses the configured base ante unless the live, known-start, priced game opts in', () => {
  base({ ...live, enabled: undefined })
  base({ ...live, enabled: false })
  for (const mode of ['off', 'dry-run', 'drain'] as const)
    base({ ...live, mode })
  base({ ...live, startKnown: false, baseAnte: 140 }, 140)
  base({ ...live, line: { ...line, source: 'none' } })
  base({ ...live, baseAnte: 2000 }, 2000)
  base({ ...live, baseAnte: 2100 }, 2100)
  for (const source of ['polymarket', 'kalshi', 'books'] as const)
    expect(
      chooseSportsGameAnte({
        ...live,
        line: { ...line, source, bookCount: source === 'books' ? 1 : 0 },
      })
    ).toMatchObject({
      ante: SPORTS_KICKOFF_BUDGET,
      kickoffBudget: SPORTS_KICKOFF_BUDGET,
    })
})

it.each([0, -1, Infinity, NaN])(
  'rejects an invalid base ante %s before spending',
  (baseAnte) => {
    expect(() => chooseSportsGameAnte({ ...live, baseAnte })).toThrow(
      'Invalid starting liquidity'
    )
  }
)

it('rejects an incomplete or malformed winning line before additional funding', () => {
  expect(isGoodOpeningLine({ ...line, probs: [0.35, 0.35, 0.3] })).toBe(true)
  for (const change of [
    { source: 'none' as const },
    { bookCount: 0 },
    { bookCount: 1.5 },
    { probs: [] },
    { probs: [0.25, 0.25, 0.25, 0.25] },
    { probs: [-0.1, 1.1] },
    { probs: [0, 1] },
    { probs: [0, 0.5, 0.5] },
    { probs: [1, 1e-12] },
    { probs: [NaN, 0.3] },
    { probs: [0.1, 0.6] },
  ])
    expect(isGoodOpeningLine({ ...line, ...change })).toBe(false)
})
