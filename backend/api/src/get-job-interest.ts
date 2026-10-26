import { JobEmployer, JobSeekerInterest } from 'common/job-seeker'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

// Load the signed-in user's job-board interest row (or null) so the form can
// prefill their existing selections, plus the employers they have applied to.
export const getJobInterest: APIHandler<'get-job-interest'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const row = await pg.oneOrNone(
    `select skills, interests, region, open_to_contact,
            extract(epoch from created_time) * 1000 as created_time,
            extract(epoch from updated_time) * 1000 as updated_time
       from job_seeker_interest
       where user_id = $1`,
    [auth.uid]
  )
  const applied = (
    await pg.manyOrNone(
      `select employer from job_board_applications where user_id = $1`,
      [auth.uid]
    )
  ).map((r) => r.employer as JobEmployer)
  if (!row) return { interest: null, applied }
  const interest: JobSeekerInterest = {
    userId: auth.uid,
    skills: row.skills ?? [],
    interests: row.interests ?? [],
    region: row.region ?? null,
    openToContact: row.open_to_contact,
    createdTime: Number(row.created_time),
    updatedTime: Number(row.updated_time),
  }
  return { interest, applied }
}
