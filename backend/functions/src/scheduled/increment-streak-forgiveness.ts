// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const incrementStreakForgiveness = functions
  .runWith({ timeoutSeconds: 540, memory: '4GB' })
  // On every 1st day of the month at 12am PST
  .pubsub.schedule(`0 0 1 * *`)
  .onRun(async () => {
    await incrementStreakForgivenessInternal()
  })

const incrementStreakForgivenessInternal = async () => {
  const pg = createSupabaseDirectClient()
  pg.none(`
    update users
    set data = data || 
      json_build_object('streakForgiveness', 
        coalesce((data->>'streakForgiveness')::numeric, 0) + 1
      )
  `)
}
