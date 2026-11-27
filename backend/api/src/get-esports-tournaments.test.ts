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

import { omit } from 'lodash'

import { buildTournamentViews } from 'common/esports/structure'
import { EsportsTournamentView } from 'common/esports/types'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
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
  type Facts = Record<string, unknown>
  // Whole facts, as the reader writes them.
  const facts = (id: number, extra: Facts = {}): Facts => ({
    game: 'cs',
    id,
    tournament: { id: 9, name: 'Budapest Major', tier: 's' },
    stage: {
      id: 4,
      name: 'Budapest Major Stage 1',
      type: 'swiss',
      order: 1,
      roundsCount: 5,
    },
    round: 'Round 1',
    position: null,
    bestOf: 3,
    startTimeMs: Date.parse('2026-11-28T10:00:00.000Z'),
    status: 'scheduled',
    rawStatus: 'upcoming',
    team1: vitality,
    team2: spirit,
    score: null,
    winnerId: null,
    review: null,
    observedAtMs: 1000,
    ...extra,
  })
  const won = (id: number, extra: Facts = {}) =>
    facts(id, {
      status: 'final',
      rawStatus: 'finished',
      score: { team1: 2, team2: 0 },
      winnerId: vitality.id,
      ...extra,
    })
  const row = (
    eventId: string,
    series: unknown,
    id = eventId,
    close_time = closeTime
  ) => ({
    ...marketRow([
      ['Team Vitality', 0.6],
      ['Team Spirit', 0.4],
    ]),
    id,
    close_time,
    event_id: eventId,
    series,
  })
  const manyOrNone = jest.fn()
  const get = getEsportsTournaments as unknown as (props: {
    game: 'cs'
  }) => Promise<{
    tournaments: unknown[]
    markets: Record<string, { contractId: string }>
    truncated?: boolean
  }>
  const realBuilder = () =>
    jest
      .mocked(buildTournamentViews)
      .mockImplementationOnce(
        jest.requireActual<typeof import('common/esports/structure')>(
          'common/esports/structure'
        ).buildTournamentViews
      )

  beforeEach(() => {
    manyOrNone.mockReset()
    jest.mocked(log.warn).mockClear()
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
    // Three answers are enough to tell a market that isn't two-sided.
    expect(sql).toMatch(
      /where x\.contract_id = c\.id\s+order by x\.index\s+limit 3/
    )
    const [from, to, prefix, creators, limit] = params
    expect(prefix).toBe('bdl:cs:')
    expect(creators).toEqual(MANIFOLD_SPORTS_USER_IDS)
    expect(to.getTime() - from.getTime()).toBe(90 * 24 * 60 * 60 * 1000)
    // The cap, and one row more to know when it cut the read short.
    expect(limit).toBe(2001)
  })

  it('keeps only markets whose facts name their own series', async () => {
    manyOrNone.mockResolvedValue([
      row('bdl:cs:101', facts(101)),
      // Another market type on the series, not the series market itself.
      row('bdl:cs:102:map1', facts(102)),
      // Facts for a different match than the market's own id.
      row('bdl:cs:103', facts(104)),
      // Another game's id, and facts that say another game.
      row('bdl:valorant:105', facts(105)),
      row('bdl:cs:106', facts(106, { game: 'valorant' })),
      row('bdl:cs:109', 'not an object'),
      row('bdl:cs:110', null),
      row('bdl:cs:111', [facts(111)]),
      row('not-an-event-id', facts(112)),
    ])
    const { tournaments, markets, truncated } = await get({ game: 'cs' })
    expect(tournaments).toEqual([facts(101)])
    expect(Object.keys(markets)).toEqual(['101'])
    expect(markets['101']).toMatchObject({ contractId: 'bdl:cs:101' })
    expect(truncated).toBeUndefined()
    expect(buildTournamentViews).toHaveBeenLastCalledWith([facts(101)], [], {
      derive: true,
    })
  })

  // Every field of the stored facts is checked. One bad field costs that
  // series and nothing else.
  const set = (extra: Facts) => (f: Facts) => ({ ...f, ...extra })
  const within = (key: string, extra: Facts) => (f: Facts) => ({
    ...f,
    [key]: { ...(f[key] as Facts), ...extra },
  })
  it.each<[string, (f: Facts) => Facts]>([
    // The review's case: without a start the builder threw on the date.
    ['no startTimeMs', (f) => omit(f, 'startTimeMs')],
    ['a start that is text', set({ startTimeMs: '2026-11-28T10:00:00Z' })],
    ['a start no date holds', set({ startTimeMs: 1e300 })],
    ['an id that is text', set({ id: '102' })],
    ['no tournament', set({ tournament: null })],
    ['a tournament id that is a fraction', within('tournament', { id: 9.5 })],
    [
      'a tournament id past safe integers',
      within('tournament', { id: 2 ** 53 }),
    ],
    ['an empty tournament name', within('tournament', { name: ' ' })],
    ['a tier that is a number', within('tournament', { tier: 1 })],
    [
      'no tier',
      (f) => ({ ...f, tournament: { id: 9, name: 'Budapest Major' } }),
    ],
    ['a stage that is text', set({ stage: 'Stage 1' })],
    ['no stage field', (f) => omit(f, 'stage')],
    ['a stage id of zero', within('stage', { id: 0 })],
    ['a stage with no name', within('stage', { name: null })],
    ['a stage type that is a number', within('stage', { type: 3 })],
    ['a negative stage order', within('stage', { order: -1 })],
    [
      'a rounds count that is a fraction',
      within('stage', { roundsCount: 2.5 }),
    ],
    ['a round that is a number', set({ round: 1 })],
    ['no round field', (f) => omit(f, 'round')],
    ['a position that is text', set({ position: '1' })],
    ['a best-of of zero', set({ bestOf: 0 })],
    ['a status we skip', set({ status: 'postponed' })],
    ['no status', (f) => omit(f, 'status')],
    ['a raw status that is a number', set({ rawStatus: 7 })],
    ['a team with no name', set({ team1: { id: 1, code: 'VIT' } })],
    [
      'a team with no code field',
      set({ team2: { id: 2, name: 'Team Spirit' } }),
    ],
    ['a team id that is text', within('team1', { id: '1' })],
    ['a team that is a list', set({ team2: [spirit] })],
    ['no team field', (f) => omit(f, 'team2')],
    ['half a score', set({ score: { team1: 1 } })],
    ['a negative score', set({ score: { team1: -1, team2: 0 } })],
    ['a score that is a list', set({ score: [1, 0] })],
    ['a winner that is text', set({ winnerId: 'Team Vitality' })],
    ['a winner id that is a fraction', set({ winnerId: 1.5 })],
    ['no winner field', (f) => omit(f, 'winnerId')],
    ['a review that is not text', set({ review: false })],
    ['a capture time that is text', set({ observedAtMs: 'now' })],
  ])('drops stored facts with %s', async (_name, change) => {
    manyOrNone.mockResolvedValue([
      row('bdl:cs:101', facts(101)),
      row('bdl:cs:102', change(facts(102))),
      row('bdl:cs:103', facts(103)),
    ])
    const { tournaments, markets } = await get({ game: 'cs' })
    expect(tournaments).toEqual([facts(101), facts(103)])
    expect(Object.keys(markets)).toEqual(['101', '103'])
  })

  it('keeps whole facts, with what they may leave out read as empty', async () => {
    manyOrNone.mockResolvedValue([
      // No stage (League of Legends) and nothing known yet.
      row(
        'bdl:cs:101',
        facts(101, {
          stage: null,
          round: null,
          bestOf: null,
          startTimeMs: null,
          team1: null,
          team2: null,
          tournament: { id: 9, name: 'Budapest Major', tier: null },
        })
      ),
      // A Valorant stage has only an id and a name. Older facts have no raw
      // status or capture time.
      row(
        'bdl:cs:102',
        omit(
          facts(102, { stage: { id: 4, name: 'Group A' }, position: 3 }),
          'rawStatus',
          'observedAtMs'
        )
      ),
      // Anything else stored beside the facts isn't served.
      row(
        'bdl:cs:103',
        facts(103, { secret: 'x', team1: { ...vitality, x: 1 } })
      ),
    ])
    const { tournaments } = await get({ game: 'cs' })
    expect(tournaments).toEqual([
      facts(101, {
        stage: null,
        round: null,
        bestOf: null,
        startTimeMs: null,
        team1: null,
        team2: null,
        tournament: { id: 9, name: 'Budapest Major', tier: null },
      }),
      facts(102, {
        stage: {
          id: 4,
          name: 'Group A',
          type: null,
          order: null,
          roundsCount: null,
        },
        position: 3,
        rawStatus: null,
        observedAtMs: null,
      }),
      facts(103),
    ])
  })

  it('lets a winner stand only on a final series with nothing held, won by one of its teams', async () => {
    const cases: [number, Facts, number | null][] = [
      [101, won(101), vitality.id],
      [102, won(102, { winnerId: spirit.id }), spirit.id],
      // The review's case: a forfeit stored with its winner filled in.
      [103, won(103, { rawStatus: 'defwin', review: 'forfeit' }), null],
      [104, won(104, { review: 'score' }), null],
      [105, won(105, { status: 'in_progress' }), null],
      [106, won(106, { status: 'scheduled' }), null],
      // A winner who isn't one of the two teams.
      [107, won(107, { winnerId: 3 }), null],
      // A result needs two different teams.
      [108, won(108, { team2: null }), null],
      [109, won(109, { team2: { ...spirit, id: vitality.id } }), null],
    ]
    manyOrNone.mockResolvedValue(
      cases.map(([id, stored]) => row(`bdl:cs:${id}`, stored))
    )
    const { tournaments } = await get({ game: 'cs' })
    // Each series is kept, as stored but for its winner.
    expect(tournaments).toEqual(
      cases.map(([, stored, winnerId]) => ({ ...stored, winnerId }))
    )
  })

  it('counts no win from a forfeit and loses no page to a bad blob', async () => {
    // Both halves of the review's finding, through the real builder.
    realBuilder()
    const [aces, lunacy] = [
      { id: 3, name: 'Aces', code: null },
      { id: 4, name: 'Lunacy', code: null },
    ]
    manyOrNone.mockResolvedValue([
      row('bdl:cs:101', won(101)),
      row(
        'bdl:cs:102',
        won(102, {
          team1: aces,
          team2: lunacy,
          winnerId: aces.id,
          rawStatus: 'defwin',
          review: 'forfeit',
        })
      ),
      row('bdl:cs:103', omit(facts(103), 'startTimeMs')),
    ])
    const { tournaments } = await get({ game: 'cs' })
    const [event] = tournaments as EsportsTournamentView[]
    expect(tournaments).toHaveLength(1)
    const [{ view }] = event.stages
    if (view.kind !== 'swiss') throw Error(`expected swiss, got ${view.kind}`)
    expect(
      view.buckets.map((b) => [
        `${b.wins}-${b.losses}`,
        b.teams.map((t) => t.team.name),
      ])
    ).toEqual([
      ['1-0', ['Team Vitality']],
      ['0-0', ['Aces', 'Lunacy']],
      ['0-1', ['Team Spirit']],
    ])
    expect(view.problems).toEqual([
      'Finished series with no trusted result, not counted: 1.',
    ])
  })

  describe('several markets on one series', () => {
    const early = '2026-11-29T12:00:00.000Z'
    const late = '2026-11-30T12:00:00.000Z'
    const pick = async (rows: ReturnType<typeof row>[]) => {
      const picked: { facts: Facts; market: string }[] = []
      // Whatever order the rows come in.
      for (const ordered of [rows, [...rows].reverse()]) {
        manyOrNone.mockResolvedValue(ordered)
        const { tournaments, markets } = await get({ game: 'cs' })
        expect(tournaments).toHaveLength(1)
        expect(Object.keys(markets)).toEqual(['101'])
        picked.push({
          facts: tournaments[0] as Facts,
          market: markets['101'].contractId,
        })
      }
      expect(picked[0]).toEqual(picked[1])
      return picked[0]
    }

    it('believes the latest capture, and shows the market it came from', async () => {
      // The review's case: the older market closes later and says Vitality
      // won. A newer capture on the duplicate corrects that to a forfeit.
      const stale = row(
        'bdl:cs:101',
        won(101, { observedAtMs: 1000 }),
        'old',
        late
      )
      const corrected = row(
        'bdl:cs:101',
        won(101, {
          observedAtMs: 2000,
          rawStatus: 'defwin',
          review: 'forfeit',
        }),
        'new',
        early
      )
      expect(await pick([stale, corrected])).toEqual({
        facts: won(101, {
          observedAtMs: 2000,
          rawStatus: 'defwin',
          review: 'forfeit',
          winnerId: null,
        }),
        market: 'new',
      })
    })

    it('breaks a tie on capture time by close time, then by market id', async () => {
      const at = (id: string, close: string, observedAtMs: number | null) =>
        row('bdl:cs:101', facts(101, { observedAtMs, round: id }), id, close)
      expect(
        (await pick([at('a', early, 5), at('b', late, 5), at('c', early, 5)]))
          .market
      ).toBe('b')
      expect((await pick([at('a', late, 5), at('b', late, 5)])).market).toBe(
        'b'
      )
      // Facts with no capture time lose to any that have one.
      expect(
        (await pick([at('z', late, null), at('a', early, 1)])).market
      ).toBe('a')
      // A market with no overlay to show still decides the facts.
      const unlinked = { ...at('b', late, 9), creator_username: null }
      manyOrNone.mockResolvedValue([at('a', early, 5), unlinked])
      const { tournaments, markets } = await get({ game: 'cs' })
      expect(tournaments).toEqual([facts(101, { observedAtMs: 9, round: 'b' })])
      expect(markets).toEqual({})
    })
  })

  describe('the row cap', () => {
    const CAP = 2000
    // Series 1 to n, the later ids closing later, as the query orders them.
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => n - i).map((id) =>
        row(
          `bdl:cs:${id}`,
          won(id, {
            tournament: { id: 1000 + id, name: `Cup ${id}`, tier: null },
          })
        )
      )

    it('derives as usual when the read is whole', async () => {
      manyOrNone.mockResolvedValue(many(CAP))
      const { tournaments, truncated } = await get({ game: 'cs' })
      expect(tournaments).toHaveLength(CAP)
      expect(truncated).toBeUndefined()
      expect(buildTournamentViews).toHaveBeenLastCalledWith(
        expect.any(Array),
        [],
        { derive: true }
      )
      expect(log.warn).not.toHaveBeenCalled()
    })

    it('derives nothing from a read the cap cut short, and says so', async () => {
      manyOrNone.mockResolvedValue(many(CAP + 1))
      const { tournaments, markets, truncated } = await get({ game: 'cs' })
      expect(truncated).toBe(true)
      // The row past the cap, series 1, isn't used.
      expect(tournaments).toHaveLength(CAP)
      expect(Object.keys(markets)).toHaveLength(CAP)
      expect(markets['1']).toBeUndefined()
      expect(buildTournamentViews).toHaveBeenLastCalledWith(
        expect.any(Array),
        [],
        { derive: false }
      )
      expect(log.warn).toHaveBeenCalledTimes(1)
      expect(jest.mocked(log.warn).mock.calls[0][1]).toEqual({
        game: 'cs',
        MAX_SERIES: CAP,
      })
    })

    it('shows no standings for a stage the cap cut a series from', async () => {
      // The review's case: Vitality's later win is kept and its earlier loss
      // is the row the cap drops. A table would read 1-0 for a 1-1 team.
      realBuilder()
      const loss = row(
        'bdl:cs:9002',
        won(9002, { winnerId: spirit.id, score: { team1: 0, team2: 2 } }),
        'bdl:cs:9002',
        '2026-11-01T12:00:00.000Z'
      )
      const win = row('bdl:cs:9001', won(9001))
      manyOrNone.mockResolvedValue([win, ...many(CAP - 1), loss])
      const { tournaments, truncated } = await get({ game: 'cs' })
      expect(truncated).toBe(true)
      const major = (tournaments as EsportsTournamentView[]).find(
        (t) => t.tournament.id === 9
      )
      expect(major?.stages.map((s) => s.classification)).toEqual([
        {
          template: 'list',
          reason: 'Standings not derived: incomplete data',
          unknownLabels: [],
        },
      ])
      expect(major?.stages[0].view.kind).toBe('list')
      expect(major?.champion).toBeNull()
    })
  })
})
