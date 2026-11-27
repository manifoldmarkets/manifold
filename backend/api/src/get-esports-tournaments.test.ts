jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn() }),
}))
// The layout is the builder's job and has its own tests: here it echoes the
// facts it was handed, so these tests see exactly which series got through.
jest.mock('common/esports/structure', () => ({
  buildTournamentViews: jest.fn((facts: unknown[]) => facts),
}))

import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getEsportsTournaments,
  toMarketOverlay,
} from './get-esports-tournaments'

const vitality = { id: 1, name: 'Team Vitality', code: 'VIT' }
const spirit = { id: 2, name: 'Team Spirit', code: 'SPIRIT' }
const closeTime = '2026-11-28T12:00:00.000Z'

const marketRow = (answers: [string, number | null][], extra = {}) => ({
  id: 'contract',
  slug: 'vitality-vs-spirit',
  close_time: closeTime,
  resolution: null,
  creator_username: 'ManifoldSports',
  volume: 1500,
  unique_bettor_count: 12,
  answers: answers.map(([text, prob], i) => ({
    id: `answer-${i}`,
    text,
    prob,
  })),
  ...extra,
})
const teams = { team1: vitality, team2: spirit }
const teamIds = (
  answers: [string, number | null][],
  facts: Parameters<typeof toMarketOverlay>[0] = teams
) => toMarketOverlay(facts, marketRow(answers))?.answers.map((a) => a.teamId)

describe('toMarketOverlay', () => {
  it('ties each answer to its team when both names line up in order', () => {
    expect(
      toMarketOverlay(
        teams,
        marketRow([
          ['Team Vitality', 0.6],
          ['Team Spirit', 0.4],
        ])
      )
    ).toEqual({
      contractId: 'contract',
      slug: 'vitality-vs-spirit',
      creatorUsername: 'ManifoldSports',
      answers: [
        { id: 'answer-0', text: 'Team Vitality', prob: 0.6, teamId: 1 },
        { id: 'answer-1', text: 'Team Spirit', prob: 0.4, teamId: 2 },
      ],
      volume: 1500,
      uniqueBettorCount: 12,
      closeTime: Date.parse(closeTime),
      isResolved: false,
    })
  })

  it('ignores case and spacing in a name, and nothing else', () => {
    expect(
      teamIds([
        ['  team   VITALITY ', 0.6],
        ['Team Spirit', 0.4],
      ])
    ).toEqual([1, 2])
    expect(
      teamIds([
        ['Vitality', 0.6],
        ['Team Spirit', 0.4],
      ])
    ).toEqual([null, null])
  })

  it('ties no answer to a team when the market does not line up', () => {
    // The answers are the teams the other way round.
    expect(
      teamIds([
        ['Team Spirit', 0.4],
        ['Team Vitality', 0.6],
      ])
    ).toEqual([null, null])
    // A third answer: the two prices are no longer the whole market.
    expect(
      teamIds([
        ['Team Vitality', 0.5],
        ['Team Spirit', 0.3],
        ['Draw', 0.2],
      ])
    ).toEqual([null, null, null])
    // A side the provider hasn't named yet.
    expect(
      teamIds(
        [
          ['Team Vitality', 0.6],
          ['Team Spirit', 0.4],
        ],
        { team1: vitality, team2: null }
      )
    ).toEqual([null, null])
    // Two teams that would read as the same answer.
    expect(
      teamIds(
        [
          ['Team Vitality', 0.6],
          ['Team Vitality', 0.4],
        ],
        { team1: vitality, team2: { ...spirit, name: 'team vitality' } }
      )
    ).toEqual([null, null])
  })

  it.each([null, Number.NaN, -0.1, 1.2])(
    'ties no answer to a team when a price is %p',
    (prob) => {
      expect(
        teamIds([
          ['Team Vitality', prob],
          ['Team Spirit', 0.4],
        ])
      ).toEqual([null, null])
    }
  )

  it('has no overlay for a market it cannot link to', () => {
    const row = marketRow([], { creator_username: null })
    expect(toMarketOverlay(teams, row)).toBeNull()
  })

  it('reads a resolved market and missing numbers defensively', () => {
    const row = marketRow([], {
      resolution: 'answer-0',
      volume: 'lots',
      unique_bettor_count: null,
      close_time: null,
    })
    expect(toMarketOverlay(teams, row)).toMatchObject({
      isResolved: true,
      volume: 0,
      uniqueBettorCount: 0,
      closeTime: null,
    })
  })
})

describe('get-esports-tournaments', () => {
  const facts = (id: number, extra = {}) => ({
    game: 'cs',
    id,
    tournament: { id: 9, name: 'Budapest Major', tier: 's' },
    status: 'scheduled',
    team1: vitality,
    team2: spirit,
    ...extra,
  })
  const row = (eventId: string, series: unknown, id = eventId) => ({
    ...marketRow([
      ['Team Vitality', 0.6],
      ['Team Spirit', 0.4],
    ]),
    id,
    event_id: eventId,
    series,
  })
  const manyOrNone = jest.fn()
  const get = getEsportsTournaments as unknown as (props: {
    game: 'cs'
  }) => Promise<{ tournaments: unknown[]; markets: Record<string, unknown> }>

  beforeEach(() => {
    manyOrNone.mockReset()
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValue({ manyOrNone } as never)
  })

  it("reads only the game's official series markets, in a bounded window", async () => {
    manyOrNone.mockResolvedValue([])
    await expect(get({ game: 'cs' })).resolves.toEqual({
      tournaments: [],
      markets: {},
    })
    const [sql, params] = manyOrNone.mock.calls[0]
    expect(sql).toContain("starts_with(c.data->>'sportsEventId', $3)")
    expect(sql).toContain("c.data ? 'esportsSeries'")
    expect(sql).toContain('c.creator_id = any($4)')
    expect(sql).toContain("c.visibility = 'public'")
    expect(sql).toContain("c.token = 'MANA'")
    expect(sql).toContain('coalesce(c.deleted, false) = false')
    expect(sql).toContain('limit $5')
    const [from, to, prefix, creators, limit] = params
    expect(prefix).toBe('bdl:cs:')
    expect(creators).toEqual(MANIFOLD_SPORTS_USER_IDS)
    expect(to.getTime() - from.getTime()).toBe(90 * 24 * 60 * 60 * 1000)
    expect(limit).toBeGreaterThan(0)
  })

  it('keeps one market per series, and only where the facts name that series', async () => {
    manyOrNone.mockResolvedValue([
      row('bdl:cs:101', facts(101)),
      // A second market on the same series: the first one read stands.
      row('bdl:cs:101', facts(101), 'duplicate'),
      // Another market type on the series, not the series market itself.
      row('bdl:cs:102:map1', facts(102)),
      // Facts for a different match than the market's own id.
      row('bdl:cs:103', facts(104)),
      // Another game's id, and facts that say another game.
      row('bdl:valorant:105', facts(105)),
      row('bdl:cs:106', facts(106, { game: 'valorant' })),
      // Malformed facts.
      row('bdl:cs:107', facts(107, { tournament: null })),
      row('bdl:cs:108', facts(108, { status: 'postponed' })),
      row('bdl:cs:109', 'not an object'),
      row('not-an-event-id', facts(110)),
    ])
    const { tournaments, markets } = await get({ game: 'cs' })
    expect(tournaments).toEqual([facts(101)])
    expect(Object.keys(markets)).toEqual(['101'])
    expect(markets['101']).toMatchObject({ contractId: 'bdl:cs:101' })
  })
})
