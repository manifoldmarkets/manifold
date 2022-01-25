import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { getUser } from './utils'
import { Contract } from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'
import { Fold } from '../../common/fold'

export const createFold = functions.runWith({ minInstances: 1 }).https.onCall(
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

    const { name, about, tags } = data

    if (!name || typeof name !== 'string')
      return { status: 'error', message: 'Name must be a non-empty string' }

    if (!_.isArray(tags))
      return { status: 'error', message: 'Tags must be an array of strings' }

    console.log(
      'creating fold for',
      creator.username,
      'named',
      name,
      'about',
      about,
      'tags',
      tags
    )

    const slug = await getSlug(name)

    const foldRef = firestore.collection('folds').doc()

    const fold: Fold = {
      id: foldRef.id,
      curatorId: userId,
      slug,
      name,
      about,
      tags,
      createdTime: Date.now(),
      contractIds: [],
      excludedContractIds: [],
      excludedCreatorIds: [],
    }

    await foldRef.create(fold)

    return { status: 'success', fold }
  }
)

const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)

  const preexistingFold = await getFoldFromSlug(proposedSlug)

  return preexistingFold ? proposedSlug + '-' + randomString() : proposedSlug
}

const firestore = admin.firestore()

export async function getFoldFromSlug(slug: string) {
  const snap = await firestore
    .collection('folds')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
