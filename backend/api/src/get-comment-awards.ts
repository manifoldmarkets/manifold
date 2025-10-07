import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getCommentAwards: APIHandler<'get-comment-awards'> = async (
  { contractId: _contractId, commentIds },
  auth
) => {
  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone(
    `select comment_id, award_type, count(*)::int as count,
            bool_or(giver_user_id = $1) as awarded_by_me
       from comment_awards
      where comment_id = any($2)
      group by comment_id, award_type`,
    [auth?.uid ?? null, commentIds]
  )
  const awardsByComment: Record<
    string,
    { plus: number; premium: number; crystal: number; awardedByMe?: boolean }
  > = {}
  for (const id of commentIds) {
    awardsByComment[id] = { plus: 0, premium: 0, crystal: 0 }
  }
  for (const r of rows) {
    const entry = awardsByComment[r.comment_id] || {
      plus: 0,
      premium: 0,
      crystal: 0,
    }
    if (r.award_type === 'plus') entry.plus = r.count
    else if (r.award_type === 'premium') entry.premium = r.count
    else if (r.award_type === 'crystal') entry.crystal = r.count
    if (r.awarded_by_me) entry.awardedByMe = true
    awardsByComment[r.comment_id] = entry
  }
  return { awardsByComment }
}
