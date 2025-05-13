import { type APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { updateData } from 'shared/supabase/utils'
import { getUser } from 'shared/utils' // Changed import for getUser
import { getPost } from 'shared/supabase/posts' // TODO: Need this function
import { PostComment } from 'common/comment'
import { revalidatePost } from './create-post-comment'

export const editPostComment: APIHandler<'edit-post-comment'> = async (
  props,
  auth
) => {
  const { commentId, postId, content } = props

  if (!content) {
    throw new APIError(400, 'Must provide content')
  }
  const contentJson = content

  const editor = await getUser(auth.uid)
  if (!editor) throw new APIError(401, 'Your account was not found')

  const pg = createSupabaseDirectClient()

  const comment = await pg.oneOrNone(
    'SELECT data FROM old_post_comments WHERE comment_id = $1',
    [commentId],
    (row) => row.data as PostComment
  )
  if (!comment) throw new APIError(404, `Comment ${commentId} not found`)

  const post = await getPost(pg, postId)
  if (!post) throw new APIError(404, `Post ${postId} not found`)

  if (editor.id !== comment.userId && !isAdminId(editor.id))
    throw new APIError(403, 'User is not the creator of the comment.')

  await updateData(pg, 'old_post_comments' as any, 'comment_id', {
    comment_id: commentId,
    content: contentJson,
    editedTime: Date.now(),
  })

  await pg.none(
    `
    insert into post_comment_edits (post_id, editor_id, comment_id, data)
    values ($1, $2, $3, $4)
    `,
    [post.id, editor.id, comment.id, comment]
  )

  return {
    result: { success: true },
    continue: async () => {
      await revalidatePost(post)
    },
  }
}
