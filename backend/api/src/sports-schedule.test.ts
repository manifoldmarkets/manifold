jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({ contractColumnsToSelect: 'data' }))

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { SPORT_CATEGORIES } from 'common/sports-schedule'
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

beforeEach(() => {
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    manyOrNone: async (sql: string) => {
      if (sql.includes("where data->>'sportsEventId'")) return official
      if (sql.includes('select c.id, c.question')) return props
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
