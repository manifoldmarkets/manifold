import { type APIHandler } from './helpers/endpoint'

import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getFollowedAvatars: APIHandler<
  'get-followed-avatars-on-contract'
> = async (props, auth) => {
  const { contractId, answerId } = props
  const pg = createSupabaseDirectClient()
  return await pg.map(
    `select  u.data->>'avatarUrl' as avatar from users u
  join user_follows f on u.id = f.follow_id
  join user_contract_metrics m on u.id = m.user_id
  where f.user_id = $1 and m.contract_id = $2 and m.has_shares = true
  and (($3 is null and m.answer_id is null) or m.answer_id = $3)`,
    [auth.uid, contractId, answerId],
    (r) => r.avatar as string
  )
}
