import * as admin from 'firebase-admin'

import { getUser } from './utils'
import { Contract } from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'
import {
  Group,
  GroupUser,
  MAX_ABOUT_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_ID_LENGTH,
} from '../../common/group'
import { newEndpoint, validate } from '../../functions/src/api'
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1).max(MAX_GROUP_NAME_LENGTH),
  about: z.string().min(1).max(MAX_ABOUT_LENGTH),
  memberIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)),
  anyoneCanJoin: z.boolean(),
})

export const creategroup = newEndpoint(['POST'], async (req, auth) => {
  const { name, about, memberIds, anyoneCanJoin } = validate(
    bodySchema,
    req.body
  )
  const userId = auth.uid
  if (!userId) return { status: 'error', message: 'Not authorized' }

  const creator = await getUser(userId)
  if (!creator) return { status: 'error', message: 'User not found' }

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
    about,
    createdTime: Date.now(),
    mostRecentActivityTime: Date.now(),
    contractIds: [],
    anyoneCanJoin,
    memberIds,
  }

  await groupRef.create(group)

  await Promise.all(
    memberIds.map(async (memberId) => {
      const member = await getUser(memberId)
      if (!member) return
      const groupUser: GroupUser = {
        id: member.id,
        username: member.username,
        name: member.name,
        avatarUrl: member.avatarUrl,
        role: 'member',
      }
      await groupRef.collection('users').doc(memberId).set(groupUser)
    })
  )

  return { status: 'success', group: group }
})

const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)

  const preexistingGroup = await getGroupFromSlug(proposedSlug)

  return preexistingGroup ? proposedSlug + '-' + randomString() : proposedSlug
}

const firestore = admin.firestore()

export async function getGroupFromSlug(slug: string) {
  const snap = await firestore
    .collection('groups')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
