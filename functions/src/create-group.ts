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
      tags: string[]
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

    const { tags } = data

    if (!Array.isArray(tags))
      return { status: 'error', message: 'Tags must be an array of strings' }

    console.log(
      'creating group for',
      creator.username,
      'named',
      name,
      'about',
      about,
      'tags',
      tags
    )

    const slug = await getSlug(name)

    const groupRef = firestore.collection('groups').doc()

    const group: Group = {
      id: groupRef.id,
      curatorId: userId,
      slug,
      name,
      about,
      tags,
      lowercaseTags: tags.map((tag) => tag.toLowerCase()),
      createdTime: Date.now(),
      contractIds: [],
      excludedContractIds: [],
      excludedCreatorIds: [],
      followCount: 0,
    }

    await groupRef.create(group)

    await groupRef.collection('followers').doc(userId).set({ userId })

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
