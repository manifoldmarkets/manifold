import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const savePredicleResult: APIHandler<'save-predictle-result'> = async (
  props,
  auth
) => {
  const { puzzleNumber, attempts, won } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  // Insert or update the result (handles duplicate submissions gracefully)
  await pg.none(
    `INSERT INTO predictle_results (user_id, puzzle_number, attempts, won)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, puzzle_number) DO UPDATE SET
       attempts = EXCLUDED.attempts,
       won = EXCLUDED.won`,
    [userId, puzzleNumber, attempts, won]
  )

  return { success: true }
}
