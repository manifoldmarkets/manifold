import { isAdminId } from 'common/envs/constants'
import { NEW_MARKET_IMPORTANCE_SCORE } from 'common/new-contract'
import { TopLevelPost } from 'common/top-level-post'
import { removeUndefinedProps } from 'common/util/object'
import { nanoid, randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { createNewPostFromFollowedUserNotification } from 'shared/notifications/create-new-post-notif'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const createPost: APIHandler<'create-post'> = onlyUsersWhoCanPerformAction(
  'post',
  async (props, auth) => {
  const pg = createSupabaseDirectClient()

  const { title, content, isAnnouncement, visibility, isChangeLog } = props
  if ((isAnnouncement || isChangeLog) && !isAdminId(auth.uid)) {
    throw new APIError(
      403,
      'Only admins can create announcement or changelog posts'
    )
  }

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')

  const isCursedUser = creator.name === 'Rima Akter'

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
      visibility: (isCursedUser ? 'unlisted' : visibility) ?? 'public',
      isAnnouncement,
      isChangeLog,
      boosted: false,
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
        if (visibility === 'unlisted') return
        await createNewPostFromFollowedUserNotification(post, creator, pg)
      },
    }
  })
})

export const getSlug = async (tx: SupabaseTransaction, title: string) => {
  const proposedSlug = slugify(title)

  const preexistingPost = await tx.oneOrNone(
    `select exists(select 1 from old_posts where data->>'slug' = $1)`,
    [proposedSlug],
    (row) => row.exists
  )

  return preexistingPost ? proposedSlug + '-' + randomString() : proposedSlug
}
