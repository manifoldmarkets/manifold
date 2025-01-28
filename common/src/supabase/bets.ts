import { convertSQLtoTS } from 'common/supabase/utils'
import { Row, tsToMillis } from './utils'
import { Bet } from 'common/bet'
export const NON_POINTS_BETS_LIMIT = 10_000

export const convertBet = (row: Row<'contract_bets'>) => {
  const data = row.data as Bet | undefined
  return convertSQLtoTS<'contract_bets', Bet>(row, {
    updated_time: tsToMillis,
    created_time: tsToMillis,
    answer_id: (a) => (a != null ? a : undefined),
    // TODO: remove after backfilling
    expires_at: (r) => data?.expiresAt,
  })
}
