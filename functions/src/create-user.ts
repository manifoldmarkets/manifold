import * as admin from 'firebase-admin'
import { z } from 'zod'

import { PrivateUser, User } from '../../common/user'
import { getUser, getUserByUsername, getValues } from './utils'
import { randomString } from '../../common/util/random'
import {
  cleanDisplayName,
  cleanUsername,
} from '../../common/util/clean-username'
import { isWhitelisted } from '../../common/envs/constants'
import {
  CATEGORIES_GROUP_SLUG_POSTFIX,
  DEFAULT_CATEGORIES,
} from '../../common/categories'

import { track } from './analytics'
import { APIError, newEndpoint, validate } from './api'
import { Group } from '../../common/group'
import { SUS_STARTING_BALANCE, STARTING_BALANCE } from '../../common/economy'
import { getDefaultNotificationPreferences } from '../../common/user-notification-preferences'
import { removeUndefinedProps } from '../../common/util/object'
import { generateAvatarUrl } from './helpers/generate-and-update-avatar-urls'
import { getStorage } from 'firebase-admin/storage'

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
    ? fbUser.photoURL
    : await generateAvatarUrl(auth.uid, name, getStorage().bucket())
  const deviceUsedBefore =
    !deviceToken || (await isPrivateUserWithDeviceToken(deviceToken))

  const balance = deviceUsedBefore ? SUS_STARTING_BALANCE : STARTING_BALANCE

  // Only undefined prop should be avatarUrl
  const user: User = removeUndefinedProps({
    id: auth.uid,
    name,
    username,
    avatarUrl,
    balance,
    totalDeposits: balance,
    createdTime: Date.now(),
    profitCached: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
    nextLoanCached: 0,
    followerCountCached: 0,
    followedCategories: DEFAULT_CATEGORIES,
    shouldShowWelcome: true,
    fractionResolvedCorrectly: 1,
    achievements: {},
    creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
  })

  await firestore.collection('users').doc(auth.uid).create(user)
  console.log('created user', username, 'firebase id:', auth.uid)

  const privateUser: PrivateUser = {
    id: auth.uid,
    username,
    email,
    initialIpAddress: req.ip,
    initialDeviceToken: deviceToken,
    notificationPreferences: getDefaultNotificationPreferences(),
    blockedUserIds: [],
    blockedByUserIds: [],
    blockedContractIds: [],
    blockedGroupSlugs: [],
    weeklyTrendingEmailSent: false,
    weeklyPortfolioUpdateEmailSent: false,
  }

  await firestore.collection('private-users').doc(auth.uid).create(privateUser)
  await addUserToDefaultGroups(user)

  await track(auth.uid, 'create user', { username }, { ip: req.ip })

  return { user, privateUser }
})

const firestore = admin.firestore()

const isPrivateUserWithDeviceToken = async (deviceToken: string) => {
  const snap = await firestore
    .collection('private-users')
    .where('initialDeviceToken', '==', deviceToken)
    .get()

  return !snap.empty
}

export const numberUsersWithIp = async (ipAddress: string) => {
  const snap = await firestore
    .collection('private-users')
    .where('initialIpAddress', '==', ipAddress)
    .get()

  return snap.docs.length
}

const addUserToDefaultGroups = async (user: User) => {
  for (const category of Object.values(DEFAULT_CATEGORIES)) {
    const slug = category.toLowerCase() + CATEGORIES_GROUP_SLUG_POSTFIX
    const groups = await getValues<Group>(
      firestore.collection('groups').where('slug', '==', slug)
    )
    await firestore
      .collection(`groups/${groups[0].id}/groupMembers`)
      .doc(user.id)
      .set({ userId: user.id, createdTime: Date.now() })
  }
}
