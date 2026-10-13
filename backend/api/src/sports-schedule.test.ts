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
} from 'common/sports-schedule'
import { sportsSchedule } from './sports-schedule'

const kickoff = Date.now() + 60 * 60 * 1000
const groupId = (sport: string) =>
  SPORT_CATEGORIES.find((s) => s.key === sport)!.groupIds[0]
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
  question: 'Total points?',
  sports_event_id: `event-${sport}`,
  sports_market_type: 'total',
  close_time: new Date(kickoff + 10000).toISOString(),
  importance_score: 1,
  group_ids: [groupId(sport)],
}))

// Cycling sits under Sports with Tour de France inside it. The endpoint keeps
// the tree for a few minutes, so every test sees the same one.
const tree = [
  [SPORTS_DEFAULT_GROUP_ID, 'cycling', 'road-bicycle-racing', '🚲  Cycling'],
  ['cycling', 'tdf', 'tour-de-france', 'Tour de France'],
].map(([parent_id, child_id, slug, name]) => ({
  parent_id,
  child_id,
  slug,
  name,
  total_members: 10,
}))
let marketRows: typeof props = props
let officialRows: { data: Record<string, unknown> }[] = official
let answerRows: Record<string, unknown>[] = []
let linkRows: { id: string; parent_id: string; relation: string }[] = []
let linkedElsewhere: { id: string }[] = []
let linksMissing = false

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
  linkRows = []
  linkedElsewhere = []
  linksMissing = false
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    manyOrNone: async (sql: string) => {
      if (linksMissing && sql.includes('market_links'))
        throw new Error('relation "market_links" does not exist')
      if (sql.includes('from market_links l')) return linkRows
      if (sql.includes('select child_contract_id as id from market_links'))
        return linkedElsewhere
      if (sql.includes("where data->>'sportsEventId'")) return officialRows
      if (sql.includes('from answers'))
        return answerRows.length > 0
          ? answerRows
          : officialRows.flatMap(({ data }) => gameAnswers(data))
      if (sql.includes('select c.id, c.question')) return marketRows
      if (sql.includes('from group_groups')) return tree
      if (sql.includes('from group_contracts'))
        return ['nfl', 'soccer'].map((sport) => ({
          contract_id: sport,
          group_id: groupId(sport),
        }))
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

it('gives every Sports subtopic a sport and files markets from deeper topics', async () => {
  marketRows = [
    ...props,
    {
      id: 'stage-9',
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

  it('lists markets linked to a game first, grouped by their relation', async () => {
    linkRows = [{ id: 'nfl-line', parent_id: 'nfl', relation: 'line' }]
    const response = await getSchedule({ sport: 'nfl' })
    const result = 'result' in response ? response.result : response
    expect(result.games[0].related).toEqual([
      { id: 'nfl-line', kind: 'linked', group: 'game-lines' },
      { id: 'nfl-prop', kind: 'official', group: 'game-lines' },
    ])
    expect(result.games[0].relatedCount).toBe(2)
  })

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
})
