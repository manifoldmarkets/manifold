import * as admin from 'firebase-admin'

import { getUser } from './utils'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'
import { Post, MAX_POST_NAME_LENGTH } from '../../common/post'
import { APIError, newEndpoint, validate } from './api'
import { JSONContent } from '@tiptap/core'
import { z } from 'zod'

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
  name: z.string().min(1).max(MAX_POST_NAME_LENGTH),
  content: contentSchema,
})

export const createpost = newEndpoint({}, async (req, auth) => {
  const firestore = admin.firestore()
  const { name, content } = validate(postSchema, req.body)

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  console.log('creating post owned by', creator.username, 'named', name)

  const slug = await getSlug(name)

  const postRef = firestore.collection('posts').doc()

  const post: Post = {
    id: postRef.id,
    creatorId: creator.id,
    slug,
    name,
    createdTime: Date.now(),
    content: content,
  }

  await postRef.create(post)

  return { status: 'success', post: post }
})

export const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)

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
