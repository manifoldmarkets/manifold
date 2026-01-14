import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { convertUser } from 'common/supabase/users'
import { toUserAPIResponse } from 'common/api/user-types'

export const adminSearchUsersByEmail: APIHandler<
  'admin-search-users-by-email'
> = async (props, auth) => {
  const { email, limit } = props

  // Only admins can search by email
  throwErrorIfNotAdmin(auth.uid)

  const pg = createSupabaseDirectClient()

  // Search both current email and old_e_mail fields in private_users
  const results = await pg.manyOrNone(
    `
    select
      u.*,
      pu.data->>'email' as matched_email,
      pu.data->>'old_e_mail' as matched_old_email
    from users u
    join private_users pu on u.id = pu.id
    where pu.data->>'email' ilike $1
       or pu.data->>'old_e_mail' ilike $1
    order by u.data->>'lastBetTime' desc nulls last
    limit $2
    `,
    [`%${email}%`, limit]
  )

  return (results || []).map((row) => ({
    user: toUserAPIResponse(convertUser(row)),
    matchedEmail: row.matched_email || row.matched_old_email,
    matchedOnOldEmail: !row.matched_email && !!row.matched_old_email,
  }))
}
