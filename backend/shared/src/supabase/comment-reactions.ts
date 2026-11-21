import { APIError } from 'common/api/utils'
import { Reaction, ReactionType } from 'common/reaction'
import { SupabaseTransaction } from './init'

// Both clients vote on the same comment. Lock the comment across the vote and
// recount so a later transaction always sees the previous committed choice.
export async function writeCommentReaction(
  tx: SupabaseTransaction,
  commentId: string,
  userId: string,
  type: ReactionType,
  remove: boolean
) {
  const comment = await tx.oneOrNone<{ user_id: string }>(
    'select user_id from contract_comments where comment_id=$1 for update',
    [commentId]
  )
  if (!comment && !remove) throw new APIError(404, 'Failed to find comment')
  const args = [commentId, userId, type]
  let inserted: Reaction | null = null
  if (remove) {
    await tx.none(
      "delete from user_reactions where content_type='comment' and content_id=$1 and user_id=$2 and reaction_type=$3",
      args
    )
  } else {
    const kept = await tx.oneOrNone<{ reaction_id: string }>(
      `select reaction_id from user_reactions where content_type='comment' and content_id=$1 and user_id=$2 and reaction_type=$3
       order by created_time desc,reaction_id limit 1`,
      args
    )
    await tx.none(
      `delete from user_reactions where content_type='comment' and content_id=$1 and user_id=$2
        and reaction_type in ('like','dislike') and reaction_id is distinct from $3`,
      [commentId, userId, kept?.reaction_id ?? null]
    )
    if (!kept)
      inserted = await tx.one<Reaction>(
        `insert into user_reactions(content_id,content_type,content_owner_id,user_id,reaction_type)
       values($1,'comment',$4,$2,$3) returning *`,
        [...args, comment!.user_id]
      )
  }
  if (comment)
    await tx.none(
      `update contract_comments set (likes,dislikes)=
      (select count(distinct user_id) filter (where reaction_type='like'),
              count(distinct user_id) filter (where reaction_type='dislike')
       from user_reactions where content_type='comment' and content_id=$1)
      where comment_id=$1`,
      [commentId]
    )
  return inserted
}
