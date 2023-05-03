import * as admin from 'firebase-admin'

import { getUser } from 'shared/utils'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import { Post, MAX_POST_TITLE_LENGTH } from 'common/post'
import { APIError, authEndpoint, validate } from './helpers'
import { JSONContent } from '@tiptap/core'
import { z } from 'zod'
import { removeUndefinedProps } from 'common/util/object'
import { createMarketHelper } from './create-market'
import { DAY_MS } from 'common/util/time'
import { runTxn } from 'shared/run-txn'
import { PostAdCreateTxn } from 'common/txn'

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

const postSchema = z
  .object({
    title: z.string().min(1).max(MAX_POST_TITLE_LENGTH),
    content: contentSchema,
    isGroupAboutPost: z.boolean().optional(),
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
      z.object({
        type: z.literal('ad'),
        totalCost: z.number().min(0),
        costPerView: z.number().min(0),
      }),
      z.object({}), //base
    ])
  )

export const createpost = authEndpoint(async (req, auth) => {
  const firestore = admin.firestore()
  const { title, content, isGroupAboutPost, groupId, ...otherProps } = validate(
    postSchema,
    req.body
  )

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  console.log('creating post owned by', creator.username, 'titled', title)

  const slug = await getSlug(title)

  const postRef = firestore.collection('posts').doc()

  // If this is a date doc, create a market for it.
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

  // if this is an advertisement, subtract amount from user's balance and write txn
  let funds
  if ('type' in otherProps && otherProps.type === 'ad') {
    const cost = otherProps.totalCost

    if (!cost) {
      throw new APIError(403, 'totalCost required')
    }

    // deduct from user
    await firestore.runTransaction(async (trans) => {
      const result = await runTxn(trans, {
        category: 'AD_CREATE',
        fromType: 'USER',
        fromId: creator.id,
        toType: 'AD',
        toId: postRef.id,
        amount: cost,
        token: 'M$',
        description: 'Creating ad',
      } as PostAdCreateTxn)
      if (result.status == 'error') {
        throw new APIError(500, result.message ?? 'An unknown error occurred')
      }
    })

    // init current funds
    funds = cost
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
    funds,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl,
    itemType: 'post',
    visibility: 'public',
    groupId,
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
        await postRef.update({
          visibility:
            groupData.privacyStatus == 'private' ? 'private' : 'public',
        })
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
