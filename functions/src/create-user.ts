import * as admin from 'firebase-admin'
import { z } from 'zod'
import {
  PrivateUser,
  STARTING_BALANCE,
  SUS_STARTING_BALANCE,
  User,
} from '../../common/user'
import { getUser, getUserByUsername } from './utils'
import { randomString } from '../../common/util/random'
import {
  cleanDisplayName,
  cleanUsername,
} from '../../common/util/clean-username'
import { sendWelcomeEmail } from './emails'
import { isWhitelisted } from '../../common/envs/constants'
import { DEFAULT_CATEGORIES } from '../../common/categories'

import { track } from './analytics'
import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  deviceToken: z.string().optional(),
})

const opts = { secrets: ['MAILGUN_KEY'] }

export const createuser = newEndpoint(opts, async (req, auth) => {
  const { deviceToken } = validate(bodySchema, req.body)
  const preexistingUser = await getUser(auth.uid)
  if (preexistingUser)
    throw new APIError(400, 'User already exists', { user: preexistingUser })

  const fbUser = await admin.auth().getUser(auth.uid)

  const email = fbUser.email
  if (!isWhitelisted(email)) {
    throw new APIError(400, `${email} is not whitelisted`)
  }
  const emailName = email?.replace(/@.*$/, '')

  const rawName = fbUser.displayName || emailName || 'User' + randomString(4)
  const name = cleanDisplayName(rawName)
  let username = cleanUsername(name)

  const sameNameUser = await getUserByUsername(username)
  if (sameNameUser) {
    username += randomString(4)
  }

  const avatarUrl = fbUser.photoURL
  const deviceUsedBefore =
    !deviceToken || (await isPrivateUserWithDeviceToken(deviceToken))

  const ipCount = req.ip ? await numberUsersWithIp(req.ip) : 0

  const balance =
    deviceUsedBefore || ipCount > 2 ? SUS_STARTING_BALANCE : STARTING_BALANCE

  const user: User = {
    id: auth.uid,
    name,
    username,
    avatarUrl,
    balance,
    totalDeposits: balance,
    createdTime: Date.now(),
    profitCached: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
    creatorVolumeCached: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
    followerCountCached: 0,
    followedCategories: DEFAULT_CATEGORIES,
  }

  await firestore.collection('users').doc(auth.uid).create(user)
  console.log('created user', username, 'firebase id:', auth.uid)

  const privateUser: PrivateUser = {
    id: auth.uid,
    username,
    email,
    initialIpAddress: req.ip,
    initialDeviceToken: deviceToken,
  }

  await firestore.collection('private-users').doc(auth.uid).create(privateUser)

  await sendWelcomeEmail(user, privateUser)

  await track(auth.uid, 'create user', { username }, { ip: req.ip })

  return user
})

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
