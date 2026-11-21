jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({
  getContractPrivacyWhereSQLFilter: () => 'true',
}))
jest.mock('shared/utils', () => ({
  prefixedContractColumnsToSelect: 'c.data',
}))

import { getUserContractMetricsWithContracts } from 'api/get-user-contract-metrics-with-contracts'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { getSportsLeagueLabel } from 'common/sports-league-label'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const getMetrics = getUserContractMetricsWithContracts as (
  props: Parameters<typeof getUserContractMetricsWithContracts>[0]
) => ReturnType<typeof getUserContractMetricsWithContracts>

it.each([
  ['odds:americanfootball_nfl:game', 'NFL', 'NFL'],
  ['537327', 'FIFA World Cup', 'WC26'],
])(
  'preserves the profile league label for %s',
  async (eventId, league, label) => {
    const row = {
      contract: {
        data: {
          id: 'game',
          creatorId: MANIFOLD_SPORTS_USER_IDS[0],
          question: 'Home vs Away',
          mechanism: 'cpmm-multi-1',
          outcomeType: 'MULTIPLE_CHOICE',
          sportsEventId: eventId,
          sportsLeague: league,
          answers: [],
        },
        importance_score: 0,
        token: 'MANA',
      },
      metrics: [],
    }
    const map = jest.fn(
      async (
        _query: string,
        _values: unknown,
        convert: (value: typeof row) => unknown
      ) => [convert(row)]
    )
    jest.mocked(createSupabaseDirectClient).mockReturnValue({
      map,
    } as unknown as ReturnType<typeof createSupabaseDirectClient>)

    const response = await getMetrics({ userId: 'bettor', limit: 100 })
    const { contracts } = 'result' in response ? response.result : response

    expect(contracts).toHaveLength(1)
    expect(getSportsLeagueLabel(contracts[0])).toBe(label)
  }
)
