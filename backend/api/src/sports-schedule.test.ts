jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  contractColumnsToSelect: 'data',
  log: Object.assign(jest.fn(), { warn: jest.fn() }),
}))

import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  SPORT_CATEGORIES,
  SPORTS_DEFAULT_GROUP_ID,
  WNBA_TOPIC_ID,
} from 'common/sports-schedule'
import { sportsSchedule } from './sports-schedule'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { f1Season } from 'common/race-weekends'

const kickoff = Date.now() + 60 * 60 * 1000
const groupId = (sport: string) =>
  SPORT_CATEGORIES.find((s) => s.key === sport)!.groupIds[0]
// 🏀 Basketball: the NBA's topic, which WNBA games are tagged with too.
const basketball = 'NjkFkdkvRvBHoeMDQ5NB'
const official = ['nfl', 'soccer'].map((sport) => ({
  data: {
    id: sport,
    slug: sport,
    creatorUsername: 'ManifoldSports',
    question: `${sport} home wins?`,
    sportsEventId: `event-${sport}`,
    sportsHomeTeam: `${sport} Home`,
    sportsAwayTeam: `${sport} Away`,
    sportsLeague: sport === 'nfl' ? 'NFL' : 'Soccer',
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    closeTime: kickoff + 10000,
    sportsStartTimestamp: new Date(kickoff).toISOString(),
  },
}))
const props = ['nfl', 'soccer'].map((sport) => ({
  id: `${sport}-prop`,
  creator_id: MANIFOLD_SPORTS_USER_IDS[0],
  question: 'Total points?',
  sports_event_id: `event-${sport}`,
  sports_market_type: 'total',
  close_time: new Date(kickoff + 10000).toISOString(),
  importance_score: 1,
  group_ids: [groupId(sport)],
}))

// Cycling sits under Sports with Tour de France inside it, and La Liga under
// Soccer. The endpoint keeps the tree for a few minutes, so every test sees
// the same one.
const tree = [
  [SPORTS_DEFAULT_GROUP_ID, 'cycling', 'road-bicycle-racing', '🚲  Cycling'],
  ['cycling', 'tdf', 'tour-de-france', 'Tour de France'],
  [SPORTS_DEFAULT_GROUP_ID, groupId('soccer'), 'soccer', '⚽ Soccer'],
  [groupId('soccer'), 'laliga', 'la-liga', 'La Liga'],
].map(([parent_id, child_id, slug, name]) => ({
  parent_id,
  child_id,
  slug,
  name,
  total_members: 10,
}))
type MarketRow = (typeof props)[number] & { sports_league?: string | null }
let marketRows: MarketRow[] = props
let officialRows: { data: Record<string, unknown> }[] = official
let answerRows: Record<string, unknown>[] = []
// The official games' topics, unless a test sets gameGroups.
const defaultGameGroups = ['nfl', 'soccer'].map((sport) => ({
  contract_id: sport,
  group_id: groupId(sport),
}))
let gameGroups = defaultGameGroups
let linkRows: { id: string; parent_id: string; relation: string }[] = []
let linkedElsewhere: { id: string }[] = []
let linksMissing = false
let failedLinkRead: 'children' | 'parents' | undefined
let championshipRows: Record<string, unknown>[] = []

// Each game's two answers, home first, unless a test sets answerRows.
const gameAnswers = (data: Record<string, unknown>) =>
  (['sportsHomeTeam', 'sportsAwayTeam'] as const).map((team, index) => ({
    id: `${data.id}-${index === 0 ? 'home' : 'away'}`,
    index,
    contract_id: data.id,
    text: data[team],
    prob: 0.5,
    pool_yes: 1000,
    pool_no: 1000,
    p: 0.5,
  }))

beforeEach(() => {
  marketRows = props
  officialRows = official
  answerRows = []
  gameGroups = defaultGameGroups
  linkRows = []
  linkedElsewhere = []
  linksMissing = false
  failedLinkRead = undefined
  championshipRows = []
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    one: async (sql: string, params: [string[], ...unknown[]]) => {
      expect(sql).toContain('with eligible_links')
      expect(sql).toContain('as with_parents')
      if (linksMissing || failedLinkRead)
        throw new Error('Link snapshot unavailable')
      return {
        // Only children of the parents asked about, as the query reads them.
        linked: linkRows.filter((l) => params[0].includes(l.parent_id)),
        with_parents: linkedElsewhere.map((l) => l.id),
      }
    },
    manyOrNone: async (sql: string) => {
      if (linksMissing && sql.includes('market_links'))
        throw new Error('relation "market_links" does not exist')
      if (sql.includes('from market_links l')) {
        if (failedLinkRead === 'children') throw new Error('Link read failed')
        return linkRows
      }
      if (sql.includes('select child_contract_id as id from market_links')) {
        if (failedLinkRead === 'parents') throw new Error('Link read failed')
        return linkedElsewhere
      }
      if (sql.includes("where data->>'sportsEventId'")) return officialRows
      if (sql.includes('as bettors')) return championshipRows
      if (sql.includes('from answers'))
        return answerRows.length > 0
          ? answerRows
          : officialRows.flatMap(({ data }) => gameAnswers(data))
      if (sql.includes('select c.id, c.question')) return marketRows
      if (sql.includes('from group_groups')) return tree
      if (sql.includes('from group_contracts')) return gameGroups
      return []
    },
  } as unknown as ReturnType<typeof createSupabaseDirectClient>)
})

it('rail counts and the week feed stay stable across sports, limits and includeRelated', async () => {
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  for (const options of [
    { sport: 'all' as const },
    { sport: 'nfl' as const },
    { sport: 'soccer' as const },
    { sport: 'all' as const, limit: 1 },
    { sport: 'all' as const, includeRelated: false },
  ]) {
    const response = await getSchedule(options)
    const result = 'result' in response ? response.result : response
    expect(result.counts).toEqual({ nfl: 1, soccer: 1 })
    expect(result.upcoming).toEqual([])
    expect(result.snapshotTime).toBeGreaterThan(0)
    if (options.includeRelated === false)
      expect(result.games.every((g) => g.related.length === 0)).toBe(true)
  }
})

it('returns the provider observation time as well as the receipt time', async () => {
  const received = Date.now()
  officialRows = [
    {
      data: {
        ...official[0].data,
        sportsStartTimestamp: new Date(received - 60_000).toISOString(),
        sportsLiveStatus: 'IN_PLAY',
        sportsHomeScore: 7,
        sportsAwayScore: 3,
        sportsLiveUpdatedTime: received,
        sportsScoreUpdatedTime: received - 300_000,
      },
    },
  ]
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const response = await getSchedule({ sport: 'nfl' })
  const result = 'result' in response ? response.result : response
  expect(result.games[0].liveUpdatedTime).toBe(received)
  expect(result.games[0].scoreUpdatedTime).toBe(received - 300_000)
})

it('gives every Sports subtopic a sport and files markets from deeper topics', async () => {
  marketRows = [
    ...props,
    {
      id: 'stage-9',
      creator_id: 'community',
      question: 'Who wins stage 9?',
      sports_event_id: null as unknown as string,
      sports_market_type: null as unknown as string,
      close_time: new Date(kickoff + 60 * 60 * 1000).toISOString(),
      importance_score: 1,
      group_ids: ['tdf'],
    },
  ]
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const response = await getSchedule({ sport: 'road-bicycle-racing' })
  const result = 'result' in response ? response.result : response
  expect(result.sports.map((s) => s.key)).toEqual([
    ...SPORT_CATEGORIES.map((s) => s.key),
    'road-bicycle-racing',
  ])
  // Counts are games only; the stage market is in this week's other markets.
  expect(result.counts).toEqual({ nfl: 1, soccer: 1 })
  expect(result.games).toEqual([])
  expect(result.upcoming.map((m) => m.id)).toEqual(['stage-9'])
})

it("shows a topic's games and markets on its page, and counts its games", async () => {
  const market = (id: string, question: string, topic: string) => ({
    id,
    creator_id: 'community',
    question,
    sports_event_id: null as unknown as string,
    sports_market_type: null as unknown as string,
    close_time: new Date(kickoff + 60 * 60 * 1000).toISOString(),
    importance_score: 1,
    group_ids: [topic],
  })
  marketRows = [
    ...props,
    market('stage-9', 'Who wins stage 9?', 'tdf'),
    market('pichichi', 'Who scores most this round?', 'laliga'),
  ]
  // The soccer game is a La Liga game too.
  gameGroups = [
    ...defaultGameGroups,
    { contract_id: 'soccer', group_id: 'laliga' },
  ]
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const get = async (options: Parameters<typeof sportsSchedule>[0]) => {
    const response = await getSchedule(options)
    return 'result' in response ? response.result : response
  }

  const laLiga = await get({ sport: 'soccer', topic: 'laliga' })
  expect(laLiga.games.map((g) => g.id)).toEqual(['soccer'])
  // Only the market's ref, not the topics it was picked by.
  expect(laLiga.upcoming).toEqual([
    { id: 'pichichi', closeTime: kickoff + 60 * 60 * 1000, sport: 'soccer' },
  ])
  // The rail stays the same on a topic's page.
  expect(laLiga.counts).toEqual({ nfl: 1, soccer: 1 })
  expect(laLiga.topicCounts).toEqual({ laliga: 1 })

  const tour = await get({ sport: 'road-bicycle-racing', topic: 'tdf' })
  expect(tour.games).toEqual([])
  expect(tour.upcoming.map((m) => m.id)).toEqual(['stage-9'])

  // The sport's own page still has everything filed under it.
  const soccer = await get({ sport: 'soccer' })
  expect(soccer.games.map((g) => g.id)).toEqual(['soccer'])
  expect(soccer.upcoming.map((m) => m.id)).toEqual(['pichichi'])

  // A topic the index doesn't have shows nothing, rather than every sport.
  const unknown = await get({ sport: 'all', topic: 'not-a-topic' })
  expect(unknown.games).toEqual([])
  expect(unknown.upcoming).toEqual([])
})

it('shows a cpmm-multi-2 game at its answer prices', async () => {
  // Every multiple choice market opens as cpmm-multi-2 since #4102.
  officialRows = [
    {
      data: {
        ...official[0].data,
        mechanism: 'cpmm-multi-2',
        outcomeType: 'MULTIPLE_CHOICE',
        shouldAnswersSumToOne: true,
      },
    },
  ]
  answerRows = [
    ['home', 0, 'nfl Home', 0.7],
    ['away', 1, 'nfl Away', 0.3],
  ].map(([id, index, text, prob]) => ({
    id,
    index,
    contract_id: 'nfl',
    text,
    prob,
    pool_yes: 1000,
    pool_no: 1000,
    p: prob,
  }))
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const response = await getSchedule({ sport: 'nfl' })
  const result = 'result' in response ? response.result : response
  expect(result.games).toHaveLength(1)
  expect(result.games[0]).toMatchObject({
    home: { answerId: 'home', prob: 0.7 },
    away: { answerId: 'away', prob: 0.3 },
  })
})

it('badges a team made without a code with its league code', async () => {
  // Only NFL games carried codes before every league had them.
  officialRows = [
    {
      data: {
        ...official[0].data,
        sportsLeague: 'MLB',
        sportsHomeTeam: 'New York Yankees',
        sportsAwayTeam: 'Tampa Bay Rays',
      },
    },
  ]
  answerRows = [
    ['home', 0, 'New York Yankees', null],
    ['away', 1, 'Tampa Bay Rays', 'RAYS'],
  ].map(([id, index, text, short_text]) => ({
    id,
    index,
    contract_id: 'nfl',
    text,
    short_text,
    prob: 0.5,
    pool_yes: 1000,
    pool_no: 1000,
    p: 0.5,
  }))
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const response = await getSchedule({ sport: 'all' })
  const result = 'result' in response ? response.result : response
  expect(result.games).toHaveLength(1)
  // A stored code still wins.
  expect(result.games[0]).toMatchObject({
    home: { name: 'New York Yankees', shortName: 'NYY' },
    away: { name: 'Tampa Bay Rays', shortName: 'RAYS' },
  })
})

// A market in the week's list, with no event of its own.
const weekMarket = (id: string, extra: Partial<MarketRow>): MarketRow => ({
  id,
  creator_id: 'community',
  question: `Who takes ${id}?`,
  sports_event_id: null as unknown as string,
  sports_market_type: null as unknown as string,
  close_time: new Date(kickoff + 3 * 60 * 60 * 1000).toISOString(),
  importance_score: 1,
  group_ids: [],
  ...extra,
})

it("takes a market's league only from the pipelines", async () => {
  // Anyone can stamp a sportsLeague through the API, so a community market
  // goes by its topics; a pipeline's own market goes by its league.
  marketRows = [
    weekMarket('stamped', {
      sports_league: 'NBA',
      group_ids: [groupId('soccer')],
    }),
    weekMarket('guessed', {
      sports_league: 'basketball_euroleague',
      group_ids: ['tdf'],
    }),
    weekMarket('pipeline', {
      sports_league: 'WNBA',
      creator_id: MANIFOLD_SPORTS_USER_IDS[0],
      sports_event_id: 'event-wnba-prop',
      group_ids: [basketball],
    }),
  ]
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const response = await getSchedule({ sport: 'all' })
  const result = 'result' in response ? response.result : response
  expect(
    Object.fromEntries(result.upcoming.map((m) => [m.id, m.sport]))
  ).toEqual({
    stamped: 'soccer',
    guessed: 'road-bicycle-racing',
    pipeline: 'wnba',
  })
})

it('hangs a WNBA-topic bet on a WNBA game, but not a Basketball or NBA one', async () => {
  // Basketball is the NBA's topic. A bet in it alone stays an NBA bet: NBA and
  // WNBA teams share codes (ATL), and WNBA nicknames are everyday words.
  officialRows = [
    {
      data: {
        ...official[0].data,
        id: 'game',
        slug: 'game',
        sportsEventId: 'event-wnba',
        sportsLeague: 'WNBA',
        sportsHomeTeam: 'Golden State Valkyries',
        sportsAwayTeam: 'Atlanta Dream',
      },
    },
  ]
  gameGroups = [SPORTS_DEFAULT_GROUP_ID, basketball].map((group_id) => ({
    contract_id: 'game',
    group_id,
  }))
  const question = 'Valkyries vs Dream: who scores first?'
  marketRows = [
    weekMarket('wnba', { question, group_ids: [WNBA_TOPIC_ID, basketball] }),
    weekMarket('basketball', { question, group_ids: [basketball] }),
    weekMarket('nba', { question, group_ids: [groupId('nba'), basketball] }),
  ]
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const response = await getSchedule({ sport: 'wnba' })
  const result = 'result' in response ? response.result : response
  expect(result.games.map((g) => g.sport)).toEqual(['wnba'])
  expect(result.games[0].related.map((r) => r.id)).toEqual(['wnba'])
})

const nflGame = (
  id: string,
  startTime: number,
  extra: Record<string, unknown> = {}
) => ({
  data: {
    ...official[0].data,
    id,
    slug: id,
    sportsEventId: `event-${id}`,
    sportsStartTimestamp: new Date(startTime).toISOString(),
    closeTime: startTime + 3 * 60 * 60 * 1000,
    ...extra,
  },
})

describe('paging', () => {
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>
  const page = async (props: Parameters<typeof sportsSchedule>[0]) => {
    const response = await getSchedule(props)
    return 'result' in response ? response.result : response
  }
  const hour = 60 * 60 * 1000

  beforeEach(() => {
    officialRows = [
      // Two games share a kickoff, so the id has to break the tie.
      nflGame('b', kickoff),
      nflGame('a', kickoff),
      nflGame('c', kickoff + hour),
      nflGame('d', kickoff + 2 * hour),
      nflGame('e', kickoff + 3 * hour),
      nflGame('live', Date.now() - hour),
      nflGame('done', Date.now() - 2 * hour, { resolution: 'YES' }),
    ]
  })

  it('walks the upcoming games in kickoff order, live games first', async () => {
    const first = await page({ sport: 'nfl', limit: 2 })
    expect(first.games.map((g) => g.id)).toEqual(['live', 'a', 'b'])
    expect(first.nextCursor).toBeTruthy()

    const second = await page({
      sport: 'nfl',
      limit: 2,
      cursor: first.nextCursor!,
    })
    expect(second.games.map((g) => g.id)).toEqual(['c', 'd'])
    expect(second.upcoming).toEqual([])

    const third = await page({
      sport: 'nfl',
      limit: 2,
      cursor: second.nextCursor!,
    })
    expect(third.games.map((g) => g.id)).toEqual(['e'])
    expect(third.nextCursor).toBeNull()
  })

  it('never returns finished games, and counts what the feed shows', async () => {
    const all = await page({ sport: 'all' })
    expect(all.games.map((g) => g.id)).not.toContain('done')
    expect(all.counts.nfl).toBe(6)
    expect(all.liveCount).toBe(1)
  })
})

describe('linked markets', () => {
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>

  it('keeps official lines before explicit links, preserving each relation', async () => {
    linkRows = [{ id: 'nfl-line', parent_id: 'nfl', relation: 'line' }]
    const response = await getSchedule({ sport: 'nfl' })
    const result = 'result' in response ? response.result : response
    expect(result.games[0].related).toEqual([
      { id: 'nfl-prop', kind: 'official', group: 'game-lines' },
      { id: 'nfl-line', kind: 'linked', group: 'game-lines' },
    ])
    expect(result.games[0].relatedCount).toBe(2)
  })

  it('reserves official slots even when explicit line links fill the per-game cap', async () => {
    linkRows = Array.from({ length: 25 }, (_, i) => ({
      id: `user-line-${i}`,
      parent_id: 'nfl',
      relation: 'line',
    }))
    const response = await getSchedule({ sport: 'nfl' })
    const result = 'result' in response ? response.result : response
    expect(result.games[0].related).toHaveLength(25)
    expect(result.games[0].related[0]).toEqual({
      id: 'nfl-prop',
      kind: 'official',
      group: 'game-lines',
    })
    expect(
      result.games[0].related.filter((m) => m.kind === 'linked')
    ).toHaveLength(24)
  })

  it.each(MANIFOLD_SPORTS_USER_IDS)(
    'reserves official priority for %s, not forged event metadata',
    async (trustedCreator) => {
      marketRows = [
        ...props.map((row) => ({ ...row, creator_id: trustedCreator })),
        {
          ...props[0],
          id: 'forged',
          creator_id: 'untrusted',
          question: 'Will nfl Home beat nfl Away?',
          importance_score: 1000000,
        },
      ]
      linkRows = Array.from({ length: 24 }, (_, i) => ({
        id: `linked-${i}`,
        parent_id: 'nfl',
        relation: 'prop',
      }))
      const response = await getSchedule({ sport: 'nfl' })
      const result = 'result' in response ? response.result : response
      expect(result.games[0].related).toHaveLength(25)
      expect(result.games[0].related[0]).toEqual({
        id: 'nfl-prop',
        kind: 'official',
        group: 'game-lines',
      })
      expect(
        result.games[0].related.filter((m) => m.kind === 'linked')
      ).toHaveLength(24)
      linkRows = []
      const uncapped = await getSchedule({ sport: 'nfl' })
      const available = 'result' in uncapped ? uncapped.result : uncapped
      expect(
        available.games[0].related.find((m) => m.id === 'forged')?.kind
      ).toBe('both-teams')
    }
  )

  it('keeps a market linked elsewhere off a game it would otherwise match', async () => {
    // nfl-prop carries the game's event id, but its creator linked it to
    // another market.
    linkedElsewhere = [{ id: 'nfl-prop' }]
    const response = await getSchedule({ sport: 'nfl' })
    const result = 'result' in response ? response.result : response
    expect(result.games[0].related).toEqual([])
  })

  it('still serves the page, matching by team, before the links table exists', async () => {
    linksMissing = true
    const response = await getSchedule({ sport: 'nfl' })
    const result = 'result' in response ? response.result : response
    expect(result.games[0].related.map((r) => r.id)).toEqual(['nfl-prop'])
  })

  it.each(['children', 'parents'] as const)(
    'uses the complete heuristic fallback when the %s read fails',
    async (failedRead) => {
      failedLinkRead = failedRead
      linkRows = [{ id: 'nfl-prop', parent_id: 'soccer', relation: 'prop' }]
      linkedElsewhere = [{ id: 'nfl-prop' }]
      const response = await getSchedule({ sport: 'all' })
      const result = 'result' in response ? response.result : response
      const appearances = result.games.flatMap((game) =>
        game.related
          .filter((market) => market.id === 'nfl-prop')
          .map((market) => ({ gameId: game.id, kind: market.kind }))
      )
      expect(appearances).toEqual([{ gameId: 'nfl', kind: 'official' }])
    }
  )
})

describe('F1 race weekends', () => {
  const qualifying = Date.now() + 2 * 60 * 60 * 1000
  const race = qualifying + 23 * 60 * 60 * 1000
  const f1 = (
    id: string,
    session: number,
    tail: string,
    marketType: 'winner' | 'podium',
    start: number
  ) => ({
    data: {
      id,
      slug: id,
      creatorUsername: 'ManifoldSports',
      question: `2026 Mexico City Grand Prix: ${tail}`,
      sportsEventId: `bdl-f1:374:${session}`,
      sportsMarketType: marketType,
      sportsLeague: 'Formula 1',
      mechanism: 'cpmm-multi-2',
      outcomeType: 'MULTIPLE_CHOICE',
      shouldAnswersSumToOne: marketType === 'winner',
      closeTime: start + 3 * 60 * 60 * 1000,
      sportsStartTimestamp: new Date(start).toISOString(),
    },
  })
  const f1Rows = [
    f1('pole', 1869, 'pole position', 'winner', qualifying),
    f1('race', 1870, 'race winner', 'winner', race),
    f1('podium', 1870, 'podium', 'podium', race),
  ]
  const driverAnswers = (contractId: string) =>
    [
      'Kimi Antonelli',
      'George Russell',
      'Lewis Hamilton',
      'Max Verstappen',
    ].map((text, index) => ({
      id: `${contractId}-${index}`,
      index,
      contract_id: contractId,
      text,
      prob: 0.4 - index * 0.1,
      pool_yes: 1000,
      pool_no: 1000,
      p: 0.5,
    }))
  const getSchedule = sportsSchedule as (
    props: Parameters<typeof sportsSchedule>[0]
  ) => ReturnType<typeof sportsSchedule>

  beforeEach(() => {
    officialRows = [...official, ...f1Rows]
    answerRows = [
      ...official.flatMap(({ data }) => gameAnswers(data)),
      ...f1Rows.flatMap(({ data }) => driverAnswers(data.id)),
    ]
    // The race winner also shows up among the week's markets in its topic.
    marketRows = [
      ...props,
      {
        id: 'race',
        creator_id: MANIFOLD_SPORTS_USER_IDS[0],
        question: '2026 Mexico City Grand Prix: race winner',
        sports_event_id: 'bdl-f1:374:1870',
        sports_market_type: 'winner',
        sports_league: 'Formula 1',
        close_time: new Date(race + 3 * 60 * 60 * 1000).toISOString(),
        importance_score: 1,
        group_ids: [groupId('f1')],
      },
    ]
  })

  it('puts a weekend on a card for all sports and F1, counted by session', async () => {
    for (const sport of ['all', 'f1', 'nfl'] as const) {
      const response = await getSchedule({ sport })
      const result = 'result' in response ? response.result : response
      // Two sessions to come; the games are unchanged.
      expect(result.counts).toEqual({ nfl: 1, soccer: 1, f1: 2 })
      expect(result.games.map((g) => g.id)).not.toContain('race')
      // Still among the week's markets, for a page that doesn't show the
      // card; the page drops the ones it does show (withoutRaceMarkets).
      if (sport !== 'nfl')
        expect(result.upcoming.map((m) => m.id)).toContain('race')
      const weekends = result.raceWeekends ?? []
      if (sport === 'nfl') {
        expect(weekends).toEqual([])
        continue
      }
      expect(weekends).toHaveLength(1)
      const [w] = weekends
      expect(w.name).toBe('2026 Mexico City Grand Prix')
      expect(w.sessions.map((s) => [s.label, s.status])).toEqual([
        ['Qualifying', 'upcoming'],
        ['Race', 'upcoming'],
      ])
      expect(w.sessions[1].markets.map((m) => m.id)).toEqual(['race', 'podium'])
      expect(w.sessions[1].markets[0].leaders[0].name).toBe('Kimi Antonelli')
    }
  })

  const community = (
    id: string,
    question: string,
    close: number,
    importance = 0.1
  ): MarketRow => ({
    id,
    creator_id: 'a-fan',
    question,
    sports_event_id: '',
    sports_market_type: '',
    close_time: new Date(close).toISOString(),
    importance_score: importance,
    group_ids: [groupId('f1')],
  })
  const HOUR = 60 * 60 * 1000

  it('hangs the markets about the Grand Prix under its sessions, and takes them off the week list', async () => {
    marketRows = [
      ...marketRows,
      community(
        'mx-winner',
        'F1: Who will win the 2026 Mexico City Grand Prix?',
        race + HOUR,
        0.5
      ),
      community(
        'mx-pole',
        'F1 Mexican GP: Who will take pole?',
        qualifying - 0.1 * HOUR
      ),
      community(
        'japan',
        'Who will win the 2026 Japanese Grand Prix?',
        race + HOUR
      ),
    ]
    // Someone linked a prop to the podium market.
    linkRows = [{ id: 'linked-prop', parent_id: 'podium', relation: 'prop' }]
    const response = await getSchedule({ sport: 'f1' })
    const result = 'result' in response ? response.result : response
    const [w] = result.raceWeekends ?? []
    const [quali, raceSession] = w.sessions
    expect(quali.related).toEqual([
      { id: 'mx-pole', kind: 'event', group: 'game-lines' },
    ])
    expect(raceSession.related).toEqual([
      { id: 'linked-prop', kind: 'linked', group: 'props' },
      { id: 'mx-winner', kind: 'event', group: 'game-lines' },
    ])
    expect(raceSession.relatedCount).toBe(2)
    const week = result.upcoming.map((m) => m.id)
    expect(week).not.toContain('mx-winner')
    expect(week).not.toContain('mx-pole')
    // Another weekend's market stays, as do the official ones.
    expect(week).toEqual(expect.arrayContaining(['japan', 'race']))
  })

  it("sends the season's title markets to the F1 page only", async () => {
    const season = f1Season(Date.now())
    championshipRows = [
      {
        id: 'wcc',
        question: `Who will win the ${season} Formula 1 Constructors Championship?`,
        bettors: 31,
        volume: 12000,
      },
      {
        id: 'wdc',
        question: `Who will win the ${season} Formula 1 Drivers Championship?`,
        bettors: 112,
        volume: 49000,
      },
    ]
    const f1 = await getSchedule({ sport: 'f1' })
    expect(('result' in f1 ? f1.result : f1).raceChampionships).toEqual([
      { kind: 'drivers', id: 'wdc' },
      { kind: 'constructors', id: 'wcc' },
    ])
    for (const sport of ['all', 'nfl'] as const) {
      const other = await getSchedule({ sport })
      expect(
        ('result' in other ? other.result : other).raceChampionships
      ).toEqual([])
    }
  })

  it("leaves a finished session's markets on the week list (F4213-05)", async () => {
    // Qualifying closed two hours ago; the race is still to come.
    const done = Date.now() - 5 * HOUR
    officialRows = [
      ...official,
      f1('pole', 1869, 'pole position', 'winner', done),
      ...f1Rows.slice(1),
    ]
    marketRows = [
      ...marketRows,
      // Open past qualifying, and about it.
      community('mx-pole', 'F1 Mexican GP: who gets pole?', race + HOUR),
      community('pole-linked', 'Pole lap under 1:15?', race),
    ]
    linkRows = [{ id: 'pole-linked', parent_id: 'pole', relation: 'prop' }]
    linkedElsewhere = [{ id: 'pole-linked' }]
    const response = await getSchedule({ sport: 'f1' })
    const result = 'result' in response ? response.result : response
    const [quali] = result.raceWeekends?.[0]?.sessions ?? []
    expect(quali.status).toBe('finished')
    expect(quali.related).toEqual([])
    expect(result.upcoming.map((m) => m.id)).toEqual(
      expect.arrayContaining(['mx-pole', 'pole-linked'])
    )
  })

  it('looks five weeks ahead on the F1 page, and two on all sports', async () => {
    const vegas = f1(
      'vegas',
      1900,
      'race winner',
      'winner',
      Date.now() + 21 * 24 * HOUR
    )
    vegas.data.sportsEventId = 'bdl-f1:380:1900'
    vegas.data.question = '2026 Las Vegas Grand Prix: race winner'
    officialRows = [...official, ...f1Rows, vegas]
    answerRows = [...answerRows, ...driverAnswers('vegas')]
    const ids = async (sport: 'all' | 'f1') => {
      const response = await getSchedule({ sport })
      const result = 'result' in response ? response.result : response
      // The rail counts the F1 page's sessions, whichever page asks.
      expect(result.counts.f1).toBe(3)
      return (result.raceWeekends ?? []).map((w) => w.id)
    }
    expect(await ids('f1')).toEqual(['bdl-f1:374', 'bdl-f1:380'])
    expect(await ids('all')).toEqual(['bdl-f1:374'])
  })

  it("keeps a market under a weekend /sports doesn't show on its week list (F4213-11)", async () => {
    const vegas = f1(
      'vegas',
      1900,
      'race winner',
      'winner',
      Date.now() + 21 * 24 * HOUR
    )
    vegas.data.sportsEventId = 'bdl-f1:380:1900'
    vegas.data.question = '2026 Las Vegas Grand Prix: race winner'
    officialRows = [...official, ...f1Rows, vegas]
    answerRows = [...answerRows, ...driverAnswers('vegas')]
    // Closes this week, linked to the race three weeks out.
    marketRows = [
      ...marketRows,
      community(
        'vegas-prop',
        'Will the Strip be dry on race night?',
        Date.now() + 3 * 24 * HOUR
      ),
    ]
    linkRows = [{ id: 'vegas-prop', parent_id: 'vegas', relation: 'prop' }]
    linkedElsewhere = [{ id: 'vegas-prop' }]
    const get = async (sport: 'all' | 'f1') => {
      const response = await getSchedule({ sport })
      return 'result' in response ? response.result : response
    }
    const all = await get('all')
    expect(all.upcoming.map((m) => m.id)).toContain('vegas-prop')
    const f1Page = await get('f1')
    expect(f1Page.upcoming.map((m) => m.id)).not.toContain('vegas-prop')
    const lasVegas = f1Page.raceWeekends?.find((w) => w.id === 'bdl-f1:380')
    expect(lasVegas?.sessions[0].related).toEqual([
      { id: 'vegas-prop', kind: 'linked', group: 'props' },
    ])
  })

  it('sends no weekends with a later page', async () => {
    const first = await getSchedule({ sport: 'f1', limit: 1 })
    const page = 'result' in first ? first.result : first
    expect(page.raceWeekends).toHaveLength(1)
    if (!page.nextCursor) return
    const next = await getSchedule({ sport: 'f1', cursor: page.nextCursor })
    const later = 'result' in next ? next.result : next
    expect(later.raceWeekends).toEqual([])
  })
})
