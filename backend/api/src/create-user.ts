import * as admin from 'firebase-admin'
import { z } from 'zod'

import { PrivateUser, User } from 'common/user'
import { randomString } from 'common/util/random'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'

import { getIp, track } from 'shared/analytics'
import { APIError, authEndpoint, validate } from './helpers'
import { SUS_STARTING_BALANCE, STARTING_BALANCE } from 'common/economy'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { removeUndefinedProps } from 'common/util/object'
import { generateAvatarUrl } from 'shared/helpers/generate-and-update-avatar-urls'
import { getStorage } from 'firebase-admin/storage'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { RESERVED_PATHS } from 'common/envs/constants'
import { GCPLog, isProd } from 'shared/utils'
import { trackSignupFB } from 'shared/fb-analytics'
import {
  getAverageContractEmbedding,
  getAverageGroupEmbedding,
  getDefaultEmbedding,
  normalizeAndAverageVectors,
} from 'shared/helpers/embeddings'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { generateNewUserFeedFromContracts } from 'shared/supabase/users'
import { DEFAULT_FEED_USER_ID } from 'common/feed'

import { getImportantContractsForNewUsers } from 'shared/supabase/contracts'
import { onboardLover } from 'shared/love/onboard-lover'

const bodySchema = z
  .object({
    deviceToken: z.string().optional(),
    adminToken: z.string().optional(),
    visitedContractIds: z.array(z.string()).optional(),
  })
  .strict()

export const createuser = authEndpoint(async (req, auth, log) => {
  const {
    deviceToken: preDeviceToken,
    adminToken,
    visitedContractIds,
  } = validate(bodySchema, req.body)

  const firebaseUser = await admin.auth().getUser(auth.uid)

  const isTestUser = firebaseUser.providerData[0].providerId === 'password'
  if (isTestUser && adminToken !== process.env.TEST_CREATE_USER_KEY) {
    throw new APIError(
      401,
      'Must use correct TEST_CREATE_USER_KEY to create user with email/password'
    )
  }

  const host = req.get('referer')
  log(`Create user from: ${host}`)
  const fromLove =
    (host?.includes('localhost')
      ? process.env.IS_MANIFOLD_LOVE === 'true'
      : host?.includes('manifold.love')) || undefined
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
        throw new APIError(403, 'User already exists', {
          userId: auth.uid,
        })

      // Check exact username to avoid problems with duplicate requests
      const sameNameUser = await trans.get(
        firestore.collection('users').where('username', '==', username)
      )
      if (!sameNameUser.empty)
        throw new APIError(403, 'Username already taken', { username })

      // Only undefined prop should be fromLove
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
        streakForgiveness: 1,
        shouldShowWelcome: true,
        creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
        isBannedFromPosting: Boolean(
          (deviceToken && bannedDeviceTokens.includes(deviceToken)) ||
            (ip && bannedIpAddresses.includes(ip))
        ),
        fromLove,
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

  log('created user ', { username: user.username, firebaseId: auth.uid })
  const pg = createSupabaseDirectClient()
  if (fromLove) await onboardLover(user, ip, log)
  await addContractsToSeenMarketsTable(auth.uid, visitedContractIds, pg)
  await upsertNewUserEmbeddings(auth.uid, visitedContractIds, pg, log)
  const interestingContractIds = await getImportantContractsForNewUsers(100, pg)
  await generateNewUserFeedFromContracts(
    auth.uid,
    pg,
    DEFAULT_FEED_USER_ID, // Should we just use the ALL_FEED_USER_ID now that we have tailored contract ids?
    interestingContractIds,
    0.5,
    log
  )

  await track(auth.uid, 'create user', { username: user.username }, { ip })

  if (process.env.FB_ACCESS_TOKEN)
    await trackSignupFB(
      process.env.FB_ACCESS_TOKEN,
      user.id,
      email ?? '',
      ip
    ).catch((e) => log('error fb tracking:', e))
  else log('no FB_ACCESS_TOKEN')

  return { user, privateUser }
})

async function addContractsToSeenMarketsTable(
  userId: string,
  visitedContractIds: string[] | undefined,
  pg: SupabaseDirectClient
) {
  if (!visitedContractIds || visitedContractIds.length === 0) return

  await Promise.all(
    visitedContractIds.map((contractId) =>
      pg.none(
        `insert into user_seen_markets (user_id, contract_id, type, data)
            values ($1, $2, $3, $4)`,
        [userId, contractId, 'view market', {}]
      )
    )
  )
}

async function upsertNewUserEmbeddings(
  userId: string,
  visitedContractIds: string[] | undefined,
  pg: SupabaseDirectClient,
  log: GCPLog
): Promise<void> {
  log('Averaging contract embeddings for user ' + userId, {
    visitedContractIds,
  })
  let embed = await getAverageContractEmbedding(pg, visitedContractIds)
  if (!embed) embed = await getDefaultEmbedding(pg)
  const groupIds =
    visitedContractIds && visitedContractIds.length > 0
      ? await pg.map(
          `select group_id
        from group_contracts
        where contract_id = any($1)`,
          [visitedContractIds],
          (r) => r.group_id
        )
      : []
  log('Averaging group embeddings for user ' + userId, { groupIds })
  const groupEmbed = await getAverageGroupEmbedding(pg, groupIds)
  if (groupEmbed) {
    embed = normalizeAndAverageVectors([embed, embed, groupEmbed])
  }

  await pg.none(
    `insert into user_embeddings (user_id, interest_embedding, contract_view_embedding)
            values ($1, $2, $2)
            on conflict (user_id)
            do update set
            interest_embedding = $2,
            contract_view_embedding = $2
            `,
    [userId, embed]
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
