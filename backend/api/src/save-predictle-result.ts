import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const savePredicleResult: APIHandler<'save-predictle-result'> = async (
  props,
  auth
) => {
  const { puzzleNumber, won, gameState } = props
  const userId = auth.uid
  const attempts = gameState.attempts[0]?.feedback.length || 0

  const pg = createSupabaseDirectClient()

  // Try to insert with game_state, fall back to without if column doesn't exist
  try {
    await pg.none(
      `INSERT INTO predictle_results (user_id, puzzle_number, attempts, won, game_state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, puzzle_number) DO UPDATE SET
         attempts = EXCLUDED.attempts,
         won = EXCLUDED.won,
         game_state = EXCLUDED.game_state`,
      [userId, puzzleNumber, attempts, won, JSON.stringify(gameState)]
    )
  } catch (e: any) {
    // If game_state column doesn't exist, save without it
    if (e.message?.includes('game_state')) {
      await pg.none(
        `INSERT INTO predictle_results (user_id, puzzle_number, attempts, won)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, puzzle_number) DO UPDATE SET
           attempts = EXCLUDED.attempts,
           won = EXCLUDED.won`,
        [userId, puzzleNumber, attempts, won]
      )
    } else {
      throw e
    }
  }

  return { success: true }
}
