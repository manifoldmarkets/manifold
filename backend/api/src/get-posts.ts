import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertPost, TopLevelPost } from 'common/top-level-post'
import {
  select,
  from,
  where,
  orderBy,
  limit as limitSql,
  renderSql,
  groupBy,
  leftJoin,
} from 'shared/supabase/sql-builder'
import { buildArray } from 'common/util/array'
import { isAdminId, isModId } from 'common/envs/constants'
export const getPosts: APIHandler<'get-posts'> = async (props, auth) => {
  const { sortBy = 'created_time', term, limit, userId } = props
  const requester = auth?.uid
  const isMod = isModId(requester ?? '')
  const isAdmin = isAdminId(requester ?? '')
  const pg = createSupabaseDirectClient()

  const sqlParts = buildArray(
    select(
      'op.*, count(distinct opc.user_id) as comment_count, count(distinct r.user_id) as reaction_count'
    ),
    from('old_posts op'),
    leftJoin('old_post_comments opc on op.id = opc.post_id'),
    leftJoin('user_reactions r on op.id = r.content_id'),
    userId !== requester && !isAdmin && where(`op.visibility = 'public'`),
    userId && where(`op.creator_id = $1`),
    term &&
      term.trim().length > 0 &&
      where(
        `to_tsvector('english', op.data->>'title') @@ websearch_to_tsquery('english', $2)`
      ),
    groupBy('op.id'),
    orderBy(`op.${sortBy} DESC`),
    limitSql(limit)
  )

  const query = renderSql(...sqlParts)
  const data = await pg.manyOrNone(query, [userId, term])

  return data.map((d) => ({
    ...convertPost(d),
    reactionCount: d.reaction_count,
    commentCount: d.comment_count,
    uniqueUsers: d.reaction_count + d.comment_count,
  })) as TopLevelPost[]
}
