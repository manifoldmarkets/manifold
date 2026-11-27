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

import { omit, orderBy, uniqBy } from 'lodash'

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
    const [sql, params] = manyOrNone.mock.calls[0] as [string, unknown[]]
    // The inner query: the window's markets, one per event id.
    const inner = sql.slice(
      sql.indexOf('select distinct on'),
      sql.lastIndexOf(') s')
    )
    expect(inner).toContain("c.data->>'sportsEventId' is not null")
    expect(inner).toContain("starts_with(c.data->>'sportsEventId', $3)")
    expect(inner).toContain("c.data ? 'esportsSeries'")
    expect(inner).toContain('c.creator_id = any($4)')
    expect(inner).toContain("c.visibility = 'public'")
    expect(inner).toContain("c.token = 'MANA'")
    expect(inner).toContain('coalesce(c.deleted, false) = false')
    expect(inner).toContain("c.resolution is distinct from 'CANCEL'")
    expect(inner).toContain('c.close_time > $1 and c.close_time < $2')
    // The latest capture of each series is picked before the cap is applied:
    // the capture time first, read only where it is a number, then the same
    // tie-breaks as the code's own.
    expect(inner).toContain("select distinct on (c.data->>'sportsEventId')")
    expect(inner).toMatch(
      new RegExp(
        [
          "order by c\\.data->>'sportsEventId',",
          "case when jsonb_typeof\\(c\\.data->'esportsSeries'->'observedAtMs'\\) = 'number'",
          "then \\(c\\.data->'esportsSeries'->'observedAtMs'\\)::numeric",
          'end desc nulls last,',
          'c\\.close_time desc,',
          'c\\.id desc\\s*$',
        ].join('\\s+')
      )
    )
    expect(inner).not.toContain('limit')
    expect(sql.slice(sql.lastIndexOf(') s'))).toMatch(
      /^\) s\s+order by s\.close_time desc, s\.id desc\s+limit \$5$/
    )
    // Three answers are enough to tell a market that isn't two-sided.
    expect(sql).toMatch(
      /where x\.contract_id = s\.id\s+order by x\.index\s+limit 3/
    )
    const [from, to, prefix, creators, limit] = params as [
      Date,
      Date,
      ...unknown[]
    ]
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
    const lost = { winnerId: spirit.id, score: { team1: 1, team2: 2 } }
    const cases: [number, Facts, number | null][] = [
      [101, won(101), vitality.id],
      [102, won(102, lost), spirit.id],
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

  it('lets a winner stand only on a score that says so', async () => {
    const score = (team1: number, team2: number, extra: Facts = {}) => ({
      score: { team1, team2 },
      ...extra,
    })
    const spiritWon = { winnerId: spirit.id }
    const cases: [number, Facts, number | null][] = [
      // The review's case: a 2-0 final that names the team with no wins.
      [101, won(101, spiritWon), null],
      [102, won(102, score(0, 2)), null],
      [103, won(103, score(0, 2, spiritWon)), spirit.id],
      [104, won(104, score(2, 1)), vitality.id],
      // No score, or a level one, names nobody.
      [105, won(105, { score: null }), null],
      [106, won(106, score(1, 1)), null],
      [107, won(107, score(2, 2, spiritWon)), null],
      // A best of 3 is won with exactly two: not one, not three.
      [108, won(108, score(1, 0)), null],
      [109, won(109, score(3, 1)), null],
      // A best of 5 with three, a best of 1 with one.
      [110, won(110, score(3, 2, { bestOf: 5 })), vitality.id],
      [111, won(111, score(1, 3, { bestOf: 5, ...spiritWon })), spirit.id],
      [112, won(112, score(2, 0, { bestOf: 5 })), null],
      [113, won(113, score(4, 1, { bestOf: 5 })), null],
      [114, won(114, score(1, 0, { bestOf: 1 })), vitality.id],
      [115, won(115, score(13, 11, { bestOf: 1 })), null],
      // Any other format has no number of wins to check: the higher score
      // is all that is asked of it.
      [116, won(116, score(4, 3, { bestOf: 7 })), vitality.id],
      [117, won(117, score(3, 4, { bestOf: 7 })), null],
      [118, won(118, score(2, 0, { bestOf: null })), vitality.id],
    ]
    manyOrNone.mockResolvedValue(
      cases.map(([id, stored]) => row(`bdl:cs:${id}`, stored))
    )
    const { tournaments } = await get({ game: 'cs' })
    expect(tournaments).toEqual(
      cases.map(([, stored, winnerId]) => ({ ...stored, winnerId }))
    )
  })

  it('counts no win for a team the score says lost', async () => {
    // The review's case through the real builder: a stored 2-0 final that
    // names Team Spirit, who won no map, gave Spirit a Swiss win.
    realBuilder()
    manyOrNone.mockResolvedValue([
      row('bdl:cs:101', won(101, { winnerId: spirit.id })),
    ])
    const { tournaments } = await get({ game: 'cs' })
    const [event] = tournaments as EsportsTournamentView[]
    const [{ view }] = event.stages
    if (view.kind !== 'swiss') throw Error(`expected swiss, got ${view.kind}`)
    expect(
      view.buckets.map((b) => [
        `${b.wins}-${b.losses}`,
        b.teams.map((t) => t.team.name),
      ])
    ).toEqual([['0-0', ['Team Spirit', 'Team Vitality']]])
    expect(view.problems).toEqual([
      'Finished series with no trusted result, not counted: 1.',
    ])
    // The series itself is still there, with its score and no winner.
    expect(view.series).toMatchObject([
      { id: 101, score: { team1: 2, team2: 0 }, winnerId: null },
    ])
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

  // A stand-in for the database: what the query's own text asks of the
  // markets in its window. Where it picks `distinct on` the event id, one
  // market per event id: the latest capture first, then the latest close,
  // then the greater id. Then the rows by close time and id, newest first,
  // and no more of them than the limit it is given. The query's text was
  // checked against Postgres itself, on made-up rows; this stand-in is here
  // so that dropping the pick from the query fails a test.
  const asQuery =
    (table: ReturnType<typeof row>[]) =>
    async (sql: string, params: unknown[]) => {
      const captured = (r: (typeof table)[number]) => {
        const at = (r.series as Facts | null)?.observedAtMs
        return typeof at === 'number' ? at : -Infinity
      }
      const closes = (r: (typeof table)[number]) => Date.parse(r.close_time)
      const picked = sql.includes(
        "select distinct on (c.data->>'sportsEventId')"
      )
        ? uniqBy(
            orderBy(table, [captured, closes, 'id'], ['desc', 'desc', 'desc']),
            'event_id'
          )
        : table
      return orderBy(picked, [closes, 'id'], ['desc', 'desc']).slice(
        0,
        params[4] as number
      )
    }

  describe('several markets on one series', () => {
    const early = '2026-11-29T12:00:00.000Z'
    const late = '2026-11-30T12:00:00.000Z'
    // The query returns one market per event id. Here it hands back every
    // market, to see the code make the same pick as a second guard.
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

    it('leaves a series out when its latest capture does not read', async () => {
      // The query picks by capture time alone, so the later capture is the
      // only one that comes back. An older one that reads never stands in.
      manyOrNone.mockImplementation(
        asQuery([
          row('bdl:cs:101', won(101, { observedAtMs: 1000 }), 'old'),
          row(
            'bdl:cs:101',
            omit(facts(101, { observedAtMs: 2000 }), 'startTimeMs'),
            'new'
          ),
          row('bdl:cs:102', facts(102)),
        ])
      )
      const { tournaments, markets } = await get({ game: 'cs' })
      expect(tournaments).toEqual([facts(102)])
      expect(Object.keys(markets)).toEqual(['102'])
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

    describe('a corrected series when the markets cross the cap', () => {
      // The review's case: recorded series 19142550, HEROIC 0-1 Imperial in
      // a best of 1, was corrected to a forfeit. The older market still
      // says Imperial won.
      const id = 19142550
      const heroic = { id: 739, name: 'HEROIC', code: 'HERO' }
      const imperial = { id: 1353, name: 'Imperial', code: 'IMP' }
      const result = {
        team1: heroic,
        team2: imperial,
        bestOf: 1,
        score: { team1: 0, team2: 1 },
        winnerId: imperial.id,
      }
      const forfeit = { rawStatus: 'defwin', review: 'forfeit' }
      const first = '2026-11-01T12:00:00.000Z'
      const last = '2026-11-30T12:00:00.000Z'
      const stale = (closes: string) =>
        row(
          `bdl:cs:${id}`,
          won(id, { ...result, observedAtMs: 1000 }),
          'old',
          closes
        )
      const corrected = (closes: string) =>
        row(
          `bdl:cs:${id}`,
          won(id, { ...result, ...forfeit, observedAtMs: 2000 }),
          'new',
          closes
        )
      const read = async (table: ReturnType<typeof row>[]) => {
        manyOrNone.mockImplementation(asQuery(table))
        const { tournaments, markets, truncated } = await get({ game: 'cs' })
        const shown = (tournaments as Facts[]).filter((f) => f.id === id)
        return {
          truncated: truncated ?? false,
          series: tournaments.length,
          shown,
          market: markets[id]?.contractId,
        }
      }
      const forfeited = [
        won(id, { ...result, ...forfeit, observedAtMs: 2000, winnerId: null }),
      ]

      it('shows the correction however many other markets there are', async () => {
        // The correction's market closes before every other market, so by
        // close time it is the last row of all.
        const pair = [stale(last), corrected(first)]
        // 2,000 markets: the two on this series and 1,998 others.
        expect(await read([...pair, ...many(CAP - 2)])).toEqual({
          truncated: false,
          series: CAP - 1,
          shown: forfeited,
          market: 'new',
        })
        // One more market, 2,001 in all. Picked after the cap, the correction
        // was the row cut, and the older market made Imperial the winner
        // again. Picked before it, these are 2,000 series: a whole read.
        expect(await read([...pair, ...many(CAP - 1)])).toEqual({
          truncated: false,
          series: CAP,
          shown: forfeited,
          market: 'new',
        })
      })

      it('drops the series whole, never back to its older capture, when the cap cuts it', async () => {
        // 2,001 series: the cap cuts the one whose market closes first, and
        // that is the correction's.
        const cut = await read([stale(last), corrected(first), ...many(CAP)])
        expect(cut).toEqual({
          truncated: true,
          series: CAP,
          shown: [],
          market: undefined,
        })
        // Where the correction's market closes last instead, the series is
        // kept, as corrected.
        const kept = await read([stale(first), corrected(last), ...many(CAP)])
        expect(kept).toEqual({
          truncated: true,
          series: CAP,
          shown: forfeited,
          market: 'new',
        })
      })

      it('counts the cap in series, not in markets', async () => {
        // 2,000 series with two markets each is 4,000 markets and a whole
        // read. Each series is its later capture.
        const twice = many(CAP).flatMap((market) => [
          market,
          {
            ...market,
            id: `${market.id}:again`,
            series: { ...(market.series as Facts), observedAtMs: 2000 },
          },
        ])
        manyOrNone.mockImplementation(asQuery(twice))
        const { tournaments, markets, truncated } = await get({ game: 'cs' })
        expect(truncated).toBeUndefined()
        expect(tournaments).toHaveLength(CAP)
        expect(
          (tournaments as Facts[]).every((f) => f.observedAtMs === 2000)
        ).toBe(true)
        expect(
          Object.values(markets).every((m) => m.contractId.endsWith(':again'))
        ).toBe(true)
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
