import * as admin from 'firebase-admin'

import { getUser } from './utils'
import { Contract } from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'
import { Dashboard, MAX_DASHBOARD_NAME_LENGTH } from '../../common/dashboard'
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

const dashboardSchema = z.object({
  name: z.string().min(1).max(MAX_DASHBOARD_NAME_LENGTH),
  content: contentSchema,
})

export const createdashboard = newEndpoint({}, async (req, auth) => {
  const firestore = admin.firestore()
  const { name, content } = validate(dashboardSchema, req.body)

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  console.log('creating dashboard for', creator.username, 'named', name)

  const slug = await getSlug(name)

  const dashboardRef = firestore.collection('dashboards').doc()

  const dashboard: Dashboard = {
    id: dashboardRef.id,
    creatorId: creator.id,
    slug,
    name,
    createdTime: Date.now(),
    content: content,
  }

  await dashboardRef.create(dashboard)

  return { status: 'success', dashboard: dashboard }
})

export const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)

  const preexistingDashboard = await getDashboardFromSlug(proposedSlug)

  return preexistingDashboard
    ? proposedSlug + '-' + randomString()
    : proposedSlug
}

export async function getDashboardFromSlug(slug: string) {
  const firestore = admin.firestore()
  const snap = await firestore
    .collection('dashboards')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
