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
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    prob: 0.5,
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

beforeEach(() => {
  marketRows = props
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    manyOrNone: async (sql: string) => {
      if (sql.includes("where data->>'sportsEventId'")) return official
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
  expect(result.counts).toEqual({ nfl: 1, soccer: 1, 'road-bicycle-racing': 1 })
  expect(result.games).toEqual([])
  expect(result.upcoming.map((m) => m.id)).toEqual(['stage-9'])
})
