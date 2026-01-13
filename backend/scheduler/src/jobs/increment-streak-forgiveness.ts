import { createSupabaseDirectClient } from 'shared/supabase/init'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'

const bulkUpdateUsersByChunk = async (
  pg: ReturnType<typeof createSupabaseDirectClient>,
  daysInterval: number
) => {
  const earliestUserResult = await pg.one(`
    select min(created_time) as earliest_time
    from users
  `)
  const earliestTime = earliestUserResult.earliest_time

  const now = new Date()
  let chunkStart = new Date(earliestTime)
  let chunkEnd = new Date(chunkStart.getTime() + daysInterval * DAY_MS)
  const maxRetries = 5

  while (chunkStart < now) {
    let success = false
    let attempts = 0

    while (!success && attempts < maxRetries) {
      try {
        log(
          'Updating streak forgiveness for users created between',
          chunkStart,
          'and',
          chunkEnd
        )
        await pg.none(
          `
          update users
          set data = data || jsonb_build_object('streakForgiveness', coalesce((data->>'streakForgiveness')::numeric, 0) + 1)
          where created_time >= $1 and created_time < $2
        `,
          [chunkStart.toISOString(), chunkEnd.toISOString()]
        )
        success = true
      } catch (error) {
        attempts++
        log(
          'Failed to update streak forgiveness, attempt',
          attempts,
          'error:',
          error
        )
        if (attempts >= maxRetries) {
          throw new Error(
            `Failed to update streak forgiveness after ${maxRetries} attempts`
          )
        }
        const waitTime = Math.random() * 10000
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }

    chunkStart = chunkEnd
    chunkEnd = new Date(chunkStart.getTime() + daysInterval * DAY_MS)
  }
}

export const incrementStreakForgiveness = async () => {
  const pg = createSupabaseDirectClient()

  // All users get +1 streak forgiveness per month
  // Note: Supporter benefit is higher PURCHASE cap (maxStreakFreezes), not extra monthly grants
  // Monthly grants are the same for everyone - supporters just can store more via purchases
  await bulkUpdateUsersByChunk(pg, 15)

  log('Finished incrementing streak forgiveness for all users')
}
