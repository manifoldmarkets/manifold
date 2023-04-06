import * as admin from 'firebase-admin'
import { z } from 'zod'
import { Request } from 'express'

import { PrivateUser, User } from 'common/user'
import { getUser, getUserByUsername } from 'shared/utils'
import { randomString } from 'common/util/random'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { isWhitelisted } from 'common/envs/constants'

import { track } from 'shared/analytics'
import { APIError, authEndpoint, validate } from './helpers'
import { SUS_STARTING_BALANCE, STARTING_BALANCE } from 'common/economy'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { removeUndefinedProps } from 'common/util/object'
import { generateAvatarUrl } from 'shared/helpers/generate-and-update-avatar-urls'
import { getStorage } from 'firebase-admin/storage'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { isProd } from 'shared/utils'
import {
  getAverageContractEmbedding,
  getDefaultEmbedding,
} from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z.object({
  deviceToken: z.string().optional(),
  adminToken: z.string().optional(),
  visitedContractIds: z.array(z.string()).optional(),
})

export const createuser = authEndpoint(async (req, auth) => {
  const {
    deviceToken: preDeviceToken,
    adminToken,
    visitedContractIds,
  } = validate(bodySchema, req.body)
  const firebaseUser = await admin.auth().getUser(auth.uid)
  const isTestUser = firebaseUser.providerData[0].providerId === 'password'
  if (isTestUser && adminToken !== process.env.TEST_CREATE_USER_KEY) {
    throw new APIError(
      400,
      'Must use correct TEST_CREATE_USER_KEY to create user with email/password'
    )
  }
  const deviceToken = isTestUser ? randomString(20) : preDeviceToken

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

  const bucket = getStorage().bucket(getStorageBucketId())
  const avatarUrl = fbUser.photoURL
    ? fbUser.photoURL
    : await generateAvatarUrl(auth.uid, name, bucket)

  const deviceUsedBefore =
    !deviceToken || (await isPrivateUserWithDeviceToken(deviceToken))

  const balance = deviceUsedBefore ? SUS_STARTING_BALANCE : STARTING_BALANCE

  const pg = createSupabaseDirectClient()
  const interestEmbedding = visitedContractIds
    ? await getAverageContractEmbedding(pg, visitedContractIds)
    : getDefaultEmbedding()

  await pg.none(
    `insert into user_embeddings (user_id, interest_embedding, pre_signup_interest_embedding) values ($1, $2, $3)`,
    [auth.uid, interestEmbedding, interestEmbedding]
  )

  const ip = getIp(req)

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
    streakForgiveness: 1,
    shouldShowWelcome: true,
    achievements: {},
    creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
    isBannedFromPosting: Boolean(
      (deviceToken && bannedDeviceTokens.includes(deviceToken)) ||
        (ip && bannedIpAddresses.includes(ip))
    ),
  })

  await firestore.collection('users').doc(auth.uid).create(user)
  console.log('created user', username, 'firebase id:', auth.uid)

  const privateUser: PrivateUser = {
    id: auth.uid,
    email,
    initialIpAddress: ip,
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

  await track(auth.uid, 'create user', { username }, { ip })

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

function getStorageBucketId() {
  return isProd()
    ? PROD_CONFIG.firebaseConfig.storageBucket
    : DEV_CONFIG.firebaseConfig.storageBucket
}

const getIp = (req: Request) => {
  const xForwarded = req.headers['x-forwarded-for']
  const xForwardedIp = Array.isArray(xForwarded) ? xForwarded[0] : xForwarded

  return xForwardedIp ?? req.socket.remoteAddress ?? req.ip
}

// Automatically ban users with these device tokens or ip addresses.
const bannedDeviceTokens = ['fa807d664415', 'dcf208a11839', 'bbf18707c15d']
const bannedIpAddresses: string[] = [
  '24.176.214.250',
  '2607:fb90:bd95:dbcd:ac39:6c97:4e35:3fed',
]
