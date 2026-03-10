import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getPost } from 'shared/supabase/posts'
import { APIError } from './helpers/endpoint'

export const getPostTipInfo: APIHandler<'get-post-tip-info'> = async (
  props,
  auth
) => {
  const { postId } = props
  const pg = createSupabaseDirectClient()

  const post = await getPost(pg, postId)
  if (!post) throw new APIError(404, 'Post not found')

  const { amount_tipped_by_user } = await pg.one(
    `select coalesce(sum(amount), 0) as amount_tipped_by_user
     from txns
     where category = 'MANA_PAYMENT'
       and token = 'M$'
       and from_id = $1
       and to_id = $2
       and (
         data->'data'->>'postId' = $3
         or data->'data'->>'groupId' = $3
       )`,
    [auth.uid, post.creatorId, postId]
  )

  return { amountTippedByUser: amount_tipped_by_user }
}
