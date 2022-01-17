import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { STARTING_BALANCE, User } from '../../common/user'
import { getUser, getUserByUsername } from './utils'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'

export const createUser = functions
  .runWith({ minInstances: 1 })
  .https.onCall(async (_, context) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const preexistingUser = await getUser(userId)
    if (preexistingUser)
      return {
        status: 'error',
        message: 'User already created',
        user: preexistingUser,
      }

    const fbUser = await admin.auth().getUser(userId)

    const email = fbUser.email
    const emailName = email?.replace(/@.*$/, '')

    const name = fbUser.displayName || emailName || 'User' + randomString(4)
    let username = cleanUsername(name)

    const sameNameUser = await getUserByUsername(username)
    if (sameNameUser) {
      username += randomString(4)
    }

    const avatarUrl = fbUser.photoURL

    const user: User = {
      id: userId,
      name,
      username,
      avatarUrl,
      balance: STARTING_BALANCE,
      createdTime: Date.now(),
      totalPnLCached: 0,
      creatorVolumeCached: 0,
    }

    await firestore.collection('users').doc(userId).create(user)

    console.log('created user', username, 'firebase id:', userId)

    return { status: 'success', user }
  })

const cleanUsername = (name: string) => {
  return slugify(name.replace(/\s+/g, ''))
}

const firestore = admin.firestore()
