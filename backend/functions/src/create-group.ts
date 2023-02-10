import * as admin from 'firebase-admin'

import { getUser } from 'shared/utils'
import { Contract } from 'common/contract'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import {
  Group,
  MAX_ABOUT_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_ID_LENGTH,
} from 'common/group'
import { APIError, newEndpoint, validate } from './api'
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1).max(MAX_GROUP_NAME_LENGTH),
  memberIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)),
  anyoneCanJoin: z.boolean(),
  about: z.string().min(1).max(MAX_ABOUT_LENGTH).optional(),
})

export const creategroup = newEndpoint({}, async (req, auth) => {
  const firestore = admin.firestore()
  const { name, about, memberIds, anyoneCanJoin } = validate(
    bodySchema,
    req.body
  )

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  // Add creator id to member ids for convenience
  if (!memberIds.includes(creator.id)) memberIds.push(creator.id)

  console.log(
    'creating group for',
    creator.username,
    'named',
    name,
    'about',
    about,
    'other member ids',
    memberIds
  )

  const slug = await getSlug(name)

  const groupRef = firestore.collection('groups').doc()

  const group: Group = {
    id: groupRef.id,
    creatorId: creator.id,
    slug,
    name,
    about: about ?? '',
    createdTime: Date.now(),
    mostRecentActivityTime: Date.now(),
    // TODO: allow users to add contract ids on group creation
    anyoneCanJoin,
    totalContracts: 0,
    totalMembers: memberIds.length,
    postIds: [],
    pinnedItems: [],
  }

  await groupRef.create(group)

  // create a GroupMemberDoc for each member
  await Promise.all(
    memberIds.map((memberId) => {
      if (memberId === creator.id) {
        groupRef.collection('groupMembers').doc(memberId).create({
          userId: memberId,
          createdTime: Date.now(),
          role: 'admin',
        })
      } else {
        groupRef.collection('groupMembers').doc(memberId).create({
          userId: memberId,
          createdTime: Date.now(),
        })
      }
    })
  )

  return { status: 'success', group: group }
})

export const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)

  const preexistingGroup = await getGroupFromSlug(proposedSlug)

  return preexistingGroup ? proposedSlug + '-' + randomString() : proposedSlug
}

export async function getGroupFromSlug(slug: string) {
  const firestore = admin.firestore()
  const snap = await firestore
    .collection('groups')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
