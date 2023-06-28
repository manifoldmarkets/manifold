import { getUser } from 'shared/utils'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import { Post, MAX_POST_TITLE_LENGTH } from 'common/post'
import { APIError, authEndpoint, validate } from './helpers'
import { z } from 'zod'
import { removeUndefinedProps } from 'common/util/object'
import { createMarketHelper } from './create-market'
import { DAY_MS } from 'common/util/time'
import { contentSchema } from 'shared/zod-types'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { randomUUID } from 'crypto'
import { update } from 'lodash'
import { updateData } from 'shared/supabase/utils'

const postSchema = z
  .object({
    title: z.string().min(1).max(MAX_POST_TITLE_LENGTH),
    content: contentSchema,
    groupId: z.string().optional(),
  })
  .and(
    z.union([
      z.object({
        type: z.literal('date-doc'),
        bounty: z.number(),
        birthday: z.number(),
        question: z.string(),
      }),
      z.object({}), //base
    ])
  )

export const createpost = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  const { title, content, groupId, ...otherProps } = validate(
    postSchema,
    req.body
  )

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  console.log('creating post owned by', creator.username, 'titled', title)

  const slug = await getSlug(title)

  // If this is a date doc, create a question for it.
  let contractSlug
  if ('type' in otherProps && otherProps.type === 'date-doc') {
    const closeTime = Date.now() + DAY_MS * 30 * 3

    try {
      const result = await createMarketHelper(
        {
          question: otherProps.question,
          closeTime,
          outcomeType: 'BINARY',
          visibility: 'unlisted',
          initialProb: 50,
          // Dating group!
          groupId: 'j3ZE8fkeqiKmRGumy3O1',
        },
        auth
      )
      contractSlug = result.slug
    } catch (e) {
      console.error(e)
    }
  }

  const post: Post = removeUndefinedProps({
    ...otherProps,
    id: randomUUID(),
    creatorId: creator.id,
    slug,
    title,
    createdTime: Date.now(),
    content: content,
    contractSlug,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl,
    visibility: 'public',
    groupId,
  })

  if (groupId) {
    const group = await pg.oneOrNone(`select * from groups where id = $1`, [
      groupId,
    ])
    if (group) {
      const postIds = group.data.postIds || []
      await updateData(pg, 'groups', group.id, {
        postIds: [...postIds, post.id],
      })

      post.visibility =
        group.data.privacy_status === 'private' ? 'private' : 'public'
    }
  }

  // currently uses the trigger to populate group_id, creator_id, created_time.
  pg.none(`insert into posts (id, data) values ($1, $2)`, [post.id, post])

  return { status: 'success', post }
})

export const getSlug = async (title: string) => {
  const proposedSlug = slugify(title)

  const preexistingPost = await postExists(proposedSlug)

  return preexistingPost ? proposedSlug + '-' + randomString() : proposedSlug
}

// TODO: migrate slug in new column with unique constraint
export async function postExists(slug: string) {
  const pg = createSupabaseDirectClient()
  const post = await pg.oneOrNone(
    `select 1 from posts where data->>'slug' = $1`,
    [slug]
  )

  return !!post
}
