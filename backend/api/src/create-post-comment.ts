import { APIError, APIHandler } from './helpers/endpoint'
import { PostComment } from 'common/comment'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getPrivateUser, revalidateStaticProps } from 'shared/utils'
import { getPost } from 'shared/supabase/posts'
import { removeUndefinedProps } from 'common/util/object'
import { log } from 'shared/monitoring/log'
import { broadcastNewPostComment } from 'shared/websockets/helpers'
import { nanoid } from 'common/util/random'
import { compact } from 'lodash'
import { parseMentions } from 'common/util/parse'
import { createCommentOnPostNotification } from 'shared/notifications/create-new-contract-comment-notif'
import { TopLevelPost } from 'common/top-level-post'
import { followPostInternal } from './follow-post'

export const createPostComment: APIHandler<'create-post-comment'> =
  onlyUsersWhoCanPerformAction('comment', async (props, auth) => {
    const { postId, content, replyToCommentId } = props

    const creator = await getUser(auth.uid)
    if (!creator) throw new APIError(401, 'Your account was not found')
    if (creator.userDeleted) throw new APIError(403, 'Your account is deleted')

    const pg = createSupabaseDirectClient()
    const post = await getPost(pg, postId)
    if (!post) throw new APIError(404, 'Post not found')

    // Check if commenter is blocked by post creator or has blocked post creator
    const privateUser = await getPrivateUser(auth.uid)
    if (!privateUser) throw new APIError(401, 'Private user data not found')

    if (privateUser.blockedUserIds.includes(post.creatorId)) {
      throw new APIError(403, `You have blocked the creator of this post`)
    }
    if (privateUser.blockedByUserIds.includes(post.creatorId)) {
      throw new APIError(
        403,
        `You have been blocked by the creator of this post`
      )
    }

    const commentObjectForDataColumn: Omit<PostComment, 'createdTime'> = {
      id: nanoid(8),
      userId: creator.id,
      content,
      userName: creator.name,
      userUsername: creator.username,
      userAvatarUrl: creator.avatarUrl,
      replyToCommentId,
      visibility: post.visibility,
      postId: post.id,
      commentType: 'post',
    }

    const cleanedCommentData = removeUndefinedProps(commentObjectForDataColumn)

    try {
      const result = await pg.one(
        `INSERT INTO old_post_comments (comment_id, post_id, user_id, data)
       VALUES ($1, $2, $3, $4)
       RETURNING comment_id, created_time, data`,
        [commentObjectForDataColumn.id, post.id, creator.id, cleanedCommentData]
      )

      const comment: PostComment = {
        ...(result.data as Omit<PostComment, 'id' | 'createdTime'>),
        id: result.comment_id,
        createdTime: new Date(result.created_time).getTime(),
      }
      broadcastNewPostComment(post.id, post.visibility, creator, comment)

      return {
        result: { comment },
        continue: async () => {
          await followPostInternal(pg, post.id, creator.id)
          await revalidatePost(post)
          // Handle notifications
          try {
            let repliedUserId: string | undefined = undefined
            if (comment.replyToCommentId) {
              const repliedCommentData = await pg.oneOrNone<{
                data: PostComment
              }>(`SELECT data FROM old_post_comments WHERE comment_id = $1`, [
                comment.replyToCommentId,
              ])
              if (repliedCommentData) {
                repliedUserId = repliedCommentData.data.userId
              }
            }

            const mentionedUserIds = compact(parseMentions(comment.content))

            await createCommentOnPostNotification(
              pg,
              comment,
              post,
              creator,
              repliedUserId,
              mentionedUserIds
            )
          } catch (notificationError) {
            log.error('Failed to send post comment notifications', {
              error: notificationError,
              postId: post.id,
              commentId: comment.id,
              creatorId: creator.id,
            })
          }
        },
      }
    } catch (error) {
      log.error('Failed to create post comment', {
        error,
        postId,
        userId: creator.id,
      })
      throw new APIError(500, 'Failed to create comment')
    }
  })

export const revalidatePost = async (post: TopLevelPost) => {
  // Revalidate the post page
  const path = `/post/${post.slug}`
  revalidateStaticProps(path)
}
