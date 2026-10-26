import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

// Record that the signed-in user applied to one of an employer's roles via
// the /jobs board. Applying to any role counts for all of that employer's
// roles, so the row is keyed by (user, employer) and repeat clicks are no-ops.
// When emailing registered job seekers about an employer's roles, exclude
// users with a row here for that employer (query in the migration).
export const setJobApplied: APIHandler<'set-job-applied'> = async (
  { employer },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `insert into job_board_applications (user_id, employer)
     values ($1, $2)
     on conflict (user_id, employer) do nothing`,
    [auth.uid, employer]
  )
}
