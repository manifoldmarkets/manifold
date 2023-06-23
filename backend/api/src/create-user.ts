import * as admin from 'firebase-admin'
import { z } from 'zod'
import { Request } from 'express'

import { PrivateUser, User } from 'common/user'
import { randomString } from 'common/util/random'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'

import { track } from 'shared/analytics'
import { APIError, authEndpoint, validate } from './helpers'
import { SUS_STARTING_BALANCE, STARTING_BALANCE } from 'common/economy'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { removeUndefinedProps } from 'common/util/object'
import { generateAvatarUrl } from 'shared/helpers/generate-and-update-avatar-urls'
import { getStorage } from 'firebase-admin/storage'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { RESERVED_PATHS } from 'common/envs/constants'
import { isProd } from 'shared/utils'
import {
  getAverageContractEmbedding,
  getDefaultEmbedding,
} from 'shared/helpers/embeddings'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { repopulateNewUsersFeedFromEmbeddings } from 'shared/supabase/users'

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

  const ip = getIp(req)
  const deviceToken = isTestUser ? randomString(20) : preDeviceToken
  const deviceUsedBefore =
    !deviceToken || (await isPrivateUserWithDeviceToken(deviceToken))
  const balance = deviceUsedBefore ? SUS_STARTING_BALANCE : STARTING_BALANCE

  const fbUser = await admin.auth().getUser(auth.uid)
  const email = fbUser.email
  const emailName = email?.replace(/@.*$/, '')

  const rawName = fbUser.displayName || emailName || 'User' + randomString(4)
  const name = cleanDisplayName(rawName)

  const bucket = getStorage().bucket(getStorageBucketId())
  const avatarUrl = fbUser.photoURL
    ? fbUser.photoURL
    : await generateAvatarUrl(auth.uid, name, bucket)

  const db = createSupabaseClient()
  let username = cleanUsername(name)

  // Check username case-insensitive
  const { data } = await db
    .from('users')
    .select('id')
    .ilike('username', username)

  const usernameExists = (data ?? []).length > 0
  const isReservedName = RESERVED_PATHS.includes(username)
  if (usernameExists || isReservedName) username += randomString(4)

  const { user, privateUser } = await firestore.runTransaction(
    async (trans) => {
      const userRef = firestore.collection('users').doc(auth.uid)

      const preexistingUser = await trans.get(userRef)
      if (preexistingUser.exists)
        throw new APIError(400, 'User already exists', {
          userId: auth.uid,
        })

      // Check exact username to avoid problems with duplicate requests
      const sameNameUser = await trans.get(
        firestore.collection('users').where('username', '==', username)
      )
      if (!sameNameUser.empty)
        throw new APIError(400, 'Username already taken', { username })

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
        creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
        isBannedFromPosting: Boolean(
          (deviceToken && bannedDeviceTokens.includes(deviceToken)) ||
            (ip && bannedIpAddresses.includes(ip))
        ),
      })

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

      trans.create(userRef, user)
      trans.create(
        firestore.collection('private-users').doc(auth.uid),
        privateUser
      )

      return { user, privateUser }
    }
  )

  console.log('created user', user.username, 'firebase id:', auth.uid)
  await insertUserEmbedding(auth.uid, visitedContractIds)
  const pg = createSupabaseDirectClient()
  await repopulateNewUsersFeedFromEmbeddings(auth.uid, pg, false)

  await track(auth.uid, 'create user', { username: user.username }, { ip })

  return { user, privateUser }
})

async function insertUserEmbedding(
  userId: string,
  visitedContractIds: string[] | undefined
): Promise<void> {
  const pg = createSupabaseDirectClient()

  const { embed, defaultEmbed } = await getAverageContractEmbedding(
    pg,
    visitedContractIds
  )

  await pg.none(
    `insert into user_embeddings (user_id, interest_embedding, pre_signup_interest_embedding, pre_signup_embedding_is_default)
            values ($1, $2, $3, $4)`,
    [userId, embed, embed, defaultEmbed]
  )
}

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
const bannedDeviceTokens = [
  'fa807d664415',
  'dcf208a11839',
  'bbf18707c15d',
  '4c2d15a6cc0c',
  '0da6b4ea79d3',
]
const bannedIpAddresses: string[] = [
  '24.176.214.250',
  '2607:fb90:bd95:dbcd:ac39:6c97:4e35:3fed',
  '2607:fb91:389:ddd0:ac39:8397:4e57:f060',
  '2607:fb90:ed9a:4c8f:ac39:cf57:4edd:4027',
  '2607:fb90:bd36:517a:ac39:6c91:812c:6328',
]
