import { type APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId, isModId } from 'common/envs/constants'
import { updateData } from 'shared/supabase/utils'
import { getUser } from 'shared/utils' // Changed import for getUser
import { getPost } from 'shared/supabase/posts' // TODO: Need this function
import { PostComment } from 'common/comment'
import { revalidatePost } from './create-post-comment'
import { JSONContent } from '@tiptap/core'

interface EditProps {
  commentId: string
  postId: string
  content?: JSONContent
  hidden?: boolean
}

async function _editPostCommentInternal(props: EditProps, authId: string) {
  const pg = createSupabaseDirectClient()

  const { commentId, postId, content, hidden } = props

  if (content === undefined && hidden === undefined) {
    throw new APIError(400, 'Must provide content or hidden status to update.')
  }

  const editor = await getUser(authId)
  if (!editor) throw new APIError(401, 'Your account was not found')

  const comment = await pg.oneOrNone(
    'SELECT data FROM old_post_comments WHERE comment_id = $1',
    [commentId],
    (row) => row.data as PostComment
  )
  if (!comment) throw new APIError(404, `Comment ${commentId} not found`)

  const post = await getPost(pg, postId)
  if (!post) throw new APIError(404, `Post ${postId} not found`)

  if (!isAdminId(editor.id) && !isModId(editor.id)) {
    // Editing content is creators, mods, admins only
    if (editor.id !== comment.userId && hidden === undefined) {
      throw new APIError(403, 'User is not the creator of the comment.')
    }
    // If only hidden is being changed, allow only admin/mod to proceed
    if (content === undefined) {
      throw new APIError(
        403,
        'User is not the creator of the comment and cannot edit content.'
      )
    }
  }

  const updatePayload: Partial<PostComment> & { comment_id: string } = {
    comment_id: commentId,
  }
  if (content !== undefined) {
    updatePayload.content = content
    updatePayload.editedTime = Date.now()
  }
  if (hidden !== undefined) {
    updatePayload.hidden = hidden
  }

  await updateData(pg, 'old_post_comments', 'comment_id', updatePayload)

  if (content !== undefined) {
    await pg.none(
      `
      insert into post_comment_edits (post_id, editor_id, comment_id, data)
      values ($1, $2, $3, $4)
      `,
      [post.id, editor.id, comment.id, { ...comment, content }] // Log previous comment state before content change
    )
  }
  // Fetch the updated comment to return
  const updatedComment = await pg.oneOrNone(
    'SELECT data FROM old_post_comments WHERE comment_id = $1',
    [commentId],
    (row) => row.data as PostComment
  )

  return { updatedComment, post }
}

export const editPostComment: APIHandler<'edit-post-comment'> = async (
  props,
  auth
) => {
  const { content } = props
  if (!content) {
    throw new APIError(400, 'Must provide content')
  }
  const { post } = await _editPostCommentInternal(
    { ...props, content: content },
    auth.uid
  )

  return {
    result: { success: true },
    continue: async () => {
      await revalidatePost(post!)
    },
  }
}

export const updatePostComment: APIHandler<'update-post-comment'> = async (
  props,
  auth
) => {
  const { commentId, postId, hidden } = props

  const { updatedComment, post } = await _editPostCommentInternal(
    { commentId, postId, hidden },
    auth.uid
  )

  if (!updatedComment) throw new APIError(500, 'Failed to update comment')

  return {
    comment: updatedComment,
    continue: async () => {
      await revalidatePost(post!)
    },
  }
}
