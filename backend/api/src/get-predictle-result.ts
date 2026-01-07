import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const getPredictleResult: APIHandler<'get-predictle-result'> = async (
  props,
  auth
) => {
  const { puzzleNumber } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  // Try to fetch with game_state, fall back to without if column doesn't exist
  let row: { attempts: number; won: boolean; game_state?: any } | null = null

  try {
    row = await pg.oneOrNone<{
      attempts: number
      won: boolean
      game_state: any
    }>(
      `SELECT attempts, won, game_state FROM predictle_results 
       WHERE user_id = $1 AND puzzle_number = $2`,
      [userId, puzzleNumber]
    )
  } catch (e: any) {
    // If game_state column doesn't exist, query without it
    if (e.message?.includes('game_state')) {
      row = await pg.oneOrNone<{ attempts: number; won: boolean }>(
        `SELECT attempts, won FROM predictle_results 
         WHERE user_id = $1 AND puzzle_number = $2`,
        [userId, puzzleNumber]
      )
    } else {
      throw e
    }
  }

  if (!row || !row.game_state) {
    return { hasResult: false }
  }

  return {
    hasResult: true,
    result: {
      won: row.won,
      gameState: row.game_state,
    },
  }
}
