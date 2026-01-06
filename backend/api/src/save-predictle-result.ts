import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const savePredicleResult: APIHandler<'save-predictle-result'> = async (
  props,
  auth
) => {
  const { puzzleNumber, attempts, won } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  // Ensure table exists
  await pg.none(`
    CREATE TABLE IF NOT EXISTS predictle_results (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      puzzle_number INT NOT NULL,
      attempts INT NOT NULL,
      won BOOLEAN NOT NULL,
      created_time TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, puzzle_number)
    )
  `)

  // Insert or update the result (in case user somehow submits twice)
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
