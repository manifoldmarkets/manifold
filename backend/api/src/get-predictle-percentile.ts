import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const getPredictlePercentile: APIHandler<
  'get-predictle-percentile'
> = async (props) => {
  const { puzzleNumber, attempts } = props

  const pg = createSupabaseDirectClient()

  // Get total users who completed this puzzle
  const totalResult = await pg.one<{ count: number }>(
    `SELECT COUNT(*) as count FROM predictle_results WHERE puzzle_number = $1`,
    [puzzleNumber]
  )
  const totalUsers = Number(totalResult.count)

  if (totalUsers === 0) {
    return { percentile: 100, totalUsers: 0 }
  }

  // Count users who did worse (more attempts or lost)
  // A user "did worse" if:
  // - They lost (won = false), or
  // - They won but took more attempts
  const worseResult = await pg.one<{ count: number }>(
    `SELECT COUNT(*) as count 
     FROM predictle_results 
     WHERE puzzle_number = $1 
     AND (won = false OR (won = true AND attempts > $2))`,
    [puzzleNumber, attempts]
  )
  const usersWhoDidWorse = Number(worseResult.count)

  // Percentile = percentage of users you beat
  const percentile = Math.round((usersWhoDidWorse / totalUsers) * 100)

  return { percentile, totalUsers }
}
