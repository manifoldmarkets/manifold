import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getUser } from './utils'
import { Contract } from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'
import { Group } from '../../common/group'

export const createGroup = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      name: string
      about: string
      memberIds: string[]
      anyoneCanJoin: boolean
      visibility: 'public' | 'private' | 'unlisted'
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const creator = await getUser(userId)
    if (!creator) return { status: 'error', message: 'User not found' }

    let { name, about } = data

    if (!name || typeof name !== 'string')
      return { status: 'error', message: 'Name must be a non-empty string' }
    name = name.trim().slice(0, 140)

    if (typeof about !== 'string')
      return { status: 'error', message: 'About must be a string' }
    about = about.trim().slice(0, 140)

    const { memberIds, anyoneCanJoin, visibility } = data
    if (!Array.isArray(memberIds))
      return {
        status: 'error',
        message: 'memberIds must be an array of strings',
      }

    if (typeof anyoneCanJoin !== 'boolean')
      return { status: 'error', message: 'anyoneCanJoin must be a boolean' }

    if (typeof visibility !== 'string')
      return { status: 'error', message: 'visibility must be a string' }

    // Add creator id to member ids for querying convenience
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

    // TODO: create notification for members added to the memberIds
    const group: Group = {
      id: groupRef.id,
      creatorId: creator.id,
      slug,
      name,
      about,
      createdTime: Date.now(),
      mostRecentActivityTime: Date.now(),
      contractIds: [],
      followCount: memberIds.length,
      visibility,
      anyoneCanJoin,
      memberIds,
    }

    await groupRef.create(group)

    await Promise.all(
      memberIds.map(async (memberId) => {
        await firestore.collection('followers').doc(memberId).set({ memberId })
      })
    )

    return { status: 'success', group: group }
  }
)

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
