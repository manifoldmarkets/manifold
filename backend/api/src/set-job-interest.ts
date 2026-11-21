import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

// Upsert the signed-in user's job-board interest row. Slugs are already
// validated against the controlled vocabulary by the Zod schema.
export const setJobInterest: APIHandler<'set-job-interest'> = async (
  { skills, interests, region, openToContact },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `insert into job_seeker_interest (user_id, skills, interests, region, open_to_contact)
     values ($1, $2::text[], $3::text[], $4, $5)
     on conflict (user_id) do update set
       skills = excluded.skills,
       interests = excluded.interests,
       region = excluded.region,
       open_to_contact = excluded.open_to_contact,
       updated_time = now()`,
    [auth.uid, skills, interests, region, openToContact]
  )
}
