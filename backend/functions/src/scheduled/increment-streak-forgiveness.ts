// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'

export const incrementStreakForgiveness = functions
  .runWith({ timeoutSeconds: 540, secrets })
  // On every 1st day of the month at 12am PST
  .pubsub.schedule(`0 0 1 * *`)
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    await incrementStreakForgivenessInternal()
  })

const incrementStreakForgivenessInternal = async () => {
  const pg = createSupabaseDirectClient()
  await pg.none(`
    update users set data = data || 
      jsonb_build_object('streakForgiveness', 
        coalesce((data->'streakForgiveness')::numeric, 0) + 1
      )
  `)
}
