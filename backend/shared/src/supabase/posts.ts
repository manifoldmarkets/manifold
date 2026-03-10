import { SupabaseDirectClient } from './init'
import {
  convertPost,
  POST_TIPPED_AMOUNT_FIELD,
  TopLevelPost,
} from 'common/top-level-post'
export async function getPost(
  pg: SupabaseDirectClient,
  postId: string
): Promise<TopLevelPost | null> {
  const row = await pg.oneOrNone(
    `SELECT data, importance_score, boosted FROM old_posts WHERE id = $1`,
    [postId],
    convertPost
  )
  return row
}

export async function incrementPostTippedAmount(
  pg: SupabaseDirectClient,
  postId: string,
  creatorId: string,
  amount: number
) {
  return await pg.oneOrNone(
    `update old_posts
     set data = jsonb_set(
       data,
       ARRAY[$2]::text[],
       to_jsonb(coalesce((data->>$2)::numeric, 0) + $3::numeric)
     )
     where id = $1
       and creator_id = $4
     returning data, importance_score, boosted`,
    [postId, POST_TIPPED_AMOUNT_FIELD, amount, creatorId],
    convertPost
  )
}
