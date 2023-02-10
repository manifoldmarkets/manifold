import * as admin from 'firebase-admin'

import { getUser } from 'shared/utils'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import { Post, MAX_POST_TITLE_LENGTH } from 'common/post'
import { APIError, newEndpoint, validate } from './api'
import { JSONContent } from '@tiptap/core'
import { z } from 'zod'
import { removeUndefinedProps } from 'common/util/object'
import { createMarketHelper } from './create-market'
import { DAY_MS } from 'common/util/time'

const contentSchema: z.ZodType<JSONContent> = z.lazy(() =>
  z.intersection(
    z.record(z.any()),
    z.object({
      type: z.string().optional(),
      attrs: z.record(z.any()).optional(),
      content: z.array(contentSchema).optional(),
      marks: z
        .array(
          z.intersection(
            z.record(z.any()),
            z.object({
              type: z.string(),
              attrs: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      text: z.string().optional(),
    })
  )
)

const postSchema = z.object({
  title: z.string().min(1).max(MAX_POST_TITLE_LENGTH),
  content: contentSchema,
  isGroupAboutPost: z.boolean().optional(),
  groupId: z.string().optional(),

  // Date doc fields:
  bounty: z.number().optional(),
  birthday: z.number().optional(),
  type: z.string().optional(),
  question: z.string().optional(),
})

export const createpost = newEndpoint({}, async (req, auth) => {
  const firestore = admin.firestore()
  const { title, content, isGroupAboutPost, groupId, question, ...otherProps } =
    validate(postSchema, req.body)

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  console.log('creating post owned by', creator.username, 'titled', title)

  const slug = await getSlug(title)

  const postRef = firestore.collection('posts').doc()

  // If this is a date doc, create a market for it.
  let contractSlug
  if (question) {
    const closeTime = Date.now() + DAY_MS * 30 * 3

    try {
      const result = await createMarketHelper(
        {
          question,
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
    id: postRef.id,
    creatorId: creator.id,
    slug,
    title,
    isGroupAboutPost,
    createdTime: Date.now(),
    content: content,
    contractSlug,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl,
    itemType: 'post',
  })

  await postRef.create(post)
  if (groupId) {
    const groupRef = firestore.collection('groups').doc(groupId)
    const group = await groupRef.get()
    if (group.exists) {
      const groupData = group.data()
      if (groupData) {
        const postIds = groupData.postIds ?? []
        postIds.push(postRef.id)
        await groupRef.update({ postIds })
      }
    }
  }

  return { status: 'success', post }
})

export const getSlug = async (title: string) => {
  const proposedSlug = slugify(title)

  const preexistingPost = await getPostFromSlug(proposedSlug)

  return preexistingPost ? proposedSlug + '-' + randomString() : proposedSlug
}

export async function getPostFromSlug(slug: string) {
  const firestore = admin.firestore()
  const snap = await firestore
    .collection('posts')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Post)
}
