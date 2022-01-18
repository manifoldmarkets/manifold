import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import {
  PrivateUser,
  STARTING_BALANCE,
  SUS_STARTING_BALANCE,
  User,
} from '../../common/user'
import { getUser, getUserByUsername } from './utils'
import { randomString } from '../../common/util/random'

export const createUser = functions
  .runWith({ minInstances: 1 })
  .https.onCall(async (data: { deviceToken?: string }, context) => {
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

    const { deviceToken } = data
    const deviceUsedBefore =
      !deviceToken || (await isPrivateUserWithDeviceToken(deviceToken))

    const ipAddress = context.rawRequest.ip
    const ipCount = ipAddress ? await numberUsersWithIp(ipAddress) : 0

    const balance =
      deviceUsedBefore || ipCount > 2 ? SUS_STARTING_BALANCE : STARTING_BALANCE

    const user: User = {
      id: userId,
      name,
      username,
      avatarUrl,
      balance,
      createdTime: Date.now(),
      totalPnLCached: 0,
      creatorVolumeCached: 0,
    }

    await firestore.collection('users').doc(userId).create(user)
    console.log('created user', username, 'firebase id:', userId)

    const privateUser: PrivateUser = {
      email,
      initialIpAddress: ipAddress,
      initialDeviceToken: deviceToken,
    }

    await firestore.collection('private-users').doc(userId).create(privateUser)

    return { status: 'success', user }
  })

const cleanUsername = (name: string) => {
  return name
    .replace(/\s+/g, '')
    .normalize('NFD') // split an accented letter in the base letter and the acent
    .replace(/[\u0300-\u036f]/g, '') // remove all previously split accents
    .replace(/[^A-Za-z0-9_]/g, '') // remove all chars not letters, numbers and underscores
}

const firestore = admin.firestore()

const isPrivateUserWithDeviceToken = async (deviceToken: string) => {
  const snap = await firestore
    .collection('private-users')
    .where('initialDeviceToken', '==', deviceToken)
    .get()

  return !snap.empty
}

const numberUsersWithIp = async (ipAddress: string) => {
  const snap = await firestore
    .collection('private-users')
    .where('initialIpAddress', '==', ipAddress)
    .get()

  return snap.docs.length
}
