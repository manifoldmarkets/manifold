import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const getPredictleResult: APIHandler<'get-predictle-result'> = async (
  props,
  auth
) => {
  const { puzzleNumber } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  const row = await pg.oneOrNone<{ attempts: number; won: boolean }>(
    `SELECT attempts, won FROM predictle_results 
     WHERE user_id = $1 AND puzzle_number = $2`,
    [userId, puzzleNumber]
  )

  if (!row) {
    return { hasResult: false }
  }

  return {
    hasResult: true,
    result: {
      attempts: row.attempts,
      won: row.won,
    },
  }
}
