import { removeUndefinedProps } from 'common/util/object'
import { APIError, APIHandler } from './helpers/endpoint'
import { convertPost, TopLevelPost } from 'common/top-level-post'
import { getUser } from 'shared/utils'
import { slugify } from 'common/util/slugify'
import { nanoid, randomString } from 'common/util/random'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { createNewPostFromFollowedUserNotification } from 'shared/notifications/create-new-post-notif'

export const createPost: APIHandler<'create-post'> = async (props, auth) => {
  const pg = createSupabaseDirectClient()

  const { title, content, isAnnouncement } = props
  if (isAnnouncement && !isAdminId(auth.uid)) {
    throw new APIError(
      403,
      'You are not allowed to create an announcement post'
    )
  }

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')

  return pg.tx(async (tx) => {
    const slug = await getSlug(tx, title)

    const post: TopLevelPost = removeUndefinedProps({
      id: nanoid(8),
      creatorId: creator.id,
      slug,
      title,
      createdTime: Date.now(),
      content: content,
      creatorName: creator.name,
      creatorUsername: creator.username,
      creatorAvatarUrl: creator.avatarUrl,
      visibility: 'public',
      isAnnouncement,
      importanceScore: NEW_MARKET_IMPORTANCE_SCORE,
    })

    // currently uses the trigger to populate group_id, creator_id, created_time.
    await tx.none(`insert into old_posts (id, data) values ($1, $2)`, [
      post.id,
      post,
    ])

    return {
      result: { post },
      continue: async () => {
        await createNewPostFromFollowedUserNotification(post, creator, pg)
      },
    }
  })
}

export const getSlug = async (tx: SupabaseTransaction, title: string) => {
  const proposedSlug = slugify(title)

  const preexistingPost = await tx.oneOrNone(
    `select exists(select 1 from old_posts where data->>'slug' = $1)`,
    [proposedSlug],
    (row) => row.exists
  )

  return preexistingPost ? proposedSlug + '-' + randomString() : proposedSlug
}

import { update } from 'shared/supabase/utils'
import { isAdminId, isModId } from 'common/envs/constants'
import { getPost } from 'shared/supabase/posts'
import { NEW_MARKET_IMPORTANCE_SCORE } from 'common/new-contract'

export const updatePost: APIHandler<'update-post'> = async (props, auth) => {
  const { id, title, content, visibility } = props
  const pg = createSupabaseDirectClient()
  const post = await getPost(pg, id)
  if (!post) throw new APIError(404, 'Post not found')
  if (visibility && !isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(
      403,
      'You are not allowed to change visibility of this post'
    )
  }
  const newData = removeUndefinedProps({ id, title, content, visibility })

  const updatedPost = await update(pg, 'old_posts', 'id', {
    id,
    data: { ...post, ...newData },
    visibility,
  })
  return { post: convertPost(updatedPost) }
}
