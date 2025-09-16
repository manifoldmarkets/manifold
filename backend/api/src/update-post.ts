import { isAdminId, isModId } from 'common/envs/constants'
import { convertPost, TopLevelPost } from 'common/top-level-post'
import { removeUndefinedProps } from 'common/util/object'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getPost } from 'shared/supabase/posts'
import { updateData } from 'shared/supabase/utils'
import { revalidatePost } from './create-post-comment'
import { APIError, APIHandler } from './helpers/endpoint'
import { onlyUnbannedUsers } from './helpers/rate-limit'

export const updatePost: APIHandler<'update-post'> = onlyUnbannedUsers(
  async (props, auth) => {
    const { id, title, content, visibility } = props
    const pg = createSupabaseDirectClient()
    const post = await getPost(pg, id)
    if (!post) throw new APIError(404, 'Post not found')
    if (
      !isAdminId(auth.uid) &&
      !isModId(auth.uid) &&
      post.creatorId !== auth.uid
    ) {
      throw new APIError(
        403,
        'You are not allowed to change this post unless you are the creator, an admin, or a mod.'
      )
    }

    const newData: Partial<TopLevelPost> = removeUndefinedProps({
      id,
      title,
      content,
    })

    if (visibility === 'public') {
      // Previously unlisted by a mod.
      if (
        post.visibility === 'unlisted' &&
        !!post.unlistedById &&
        post.unlistedById !== auth.uid &&
        !isAdminId(auth.uid) &&
        !isModId(auth.uid)
      ) {
        throw new APIError(
          403,
          'This post was last unlisted by a mod. Only they can unlist it again or change its visibility.'
        )
      }
      newData.visibility = 'public'
      newData.unlistedById = undefined
    } else {
      newData.visibility = visibility
      newData.unlistedById = auth.uid
    }

    const updatePayload = removeUndefinedProps({ id, ...newData })
    const updatedPost = await updateData(pg, 'old_posts', 'id', updatePayload)
    await revalidatePost(post)
    return { post: convertPost(updatedPost) }
  }
)
