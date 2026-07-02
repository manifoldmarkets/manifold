import { APIHandler } from 'api/helpers/endpoint'
import { ENV_CONFIG } from 'common/envs/constants'
import { convertPost, TopLevelPost } from 'common/top-level-post'
import { buildArray } from 'common/util/array'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  groupBy,
  leftJoin,
  limit as limitSql,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'

// Boost added to importance_score for admin-authored posts on the Best tab.
// importance_score is clamped to [0, 1], so this gives admins meaningful
// precedence without strictly dominating high-engagement community posts.
const ADMIN_IMPORTANCE_BOOST = 0.2

export const getPosts: APIHandler<'get-posts'> = async (props, auth) => {
  const {
    sortBy = 'created_time',
    term,
    limit,
    userId,
    offset,
    isChangeLog,
  } = props
  const requester = auth?.uid
  const pg = createSupabaseDirectClient()

  const orderByClause =
    sortBy === 'new-comments'
      ? 'last_comment_time DESC NULLS LAST'
      : sortBy === 'importance_score'
      ? `op.importance_score + (case when op.creator_id in ($1:list) then ${ADMIN_IMPORTANCE_BOOST} else 0 end) DESC`
      : `op.${sortBy} DESC`

  const sqlParts = buildArray(
    select(
      'op.*, count(distinct opc.user_id) as comment_count, count(distinct r.user_id) as reaction_count, max(opc.created_time) as last_comment_time'
    ),
    from('old_posts op'),
    leftJoin('old_post_comments opc on op.id = opc.post_id'),
    leftJoin('user_reactions r on op.id = r.content_id'),
    (userId !== requester || !requester) && where(`op.visibility = 'public'`),
    where(`op.group_id is null`),
    isChangeLog && where(`(op.data->>'isChangeLog')::boolean = true`),
    userId && where(`op.creator_id = $1`),
    term &&
      term.trim().length > 0 &&
      where(
        `to_tsvector('english', op.data->>'title') @@ websearch_to_tsquery('english', $2)`
      ),
    groupBy('op.id'),
    orderBy(
      orderByClause,
      sortBy === 'importance_score' ? [ENV_CONFIG.adminIds] : undefined
    ),
    limitSql(limit, offset)
  )

  const query = renderSql(...sqlParts)
  const data = await pg.manyOrNone(query, [userId, term])
  return data.map((d) => ({
    ...convertPost(d),
    reactionCount: d.reaction_count,
    commentCount: d.comment_count,
    lastCommentTime: d.last_comment_time
      ? Date.parse(d.last_comment_time)
      : null,
    uniqueUsers: d.reaction_count + d.comment_count,
  })) as TopLevelPost[]
}
