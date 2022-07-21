import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  orderBy,
  updateDoc,
  deleteDoc,
  collectionGroup,
  onSnapshot,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { ref, getStorage, uploadBytes, getDownloadURL } from 'firebase/storage'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { zip } from 'lodash'
import { app, db } from './init'
import { PortfolioMetrics, PrivateUser, User } from 'common/user'
import {
  coll,
  getValue,
  getValues,
  listenForValue,
  listenForValues,
} from './utils'
import { feed } from 'common/feed'
import { CATEGORY_LIST } from 'common/categories'
import { safeLocalStorage } from '../util/local'
import { filterDefined } from 'common/util/array'
import { addUserToGroupViaId } from 'web/lib/firebase/groups'
import { removeUndefinedProps } from 'common/util/object'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

import { track } from '@amplitude/analytics-browser'

export const users = coll<User>('users')
export const privateUsers = coll<PrivateUser>('private-users')

export type { User }

export type Period = 'daily' | 'weekly' | 'monthly' | 'allTime'

export const auth = getAuth(app)

export async function getUser(userId: string) {
  /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
  return (await getDoc(doc(users, userId))).data()!
}

export async function getUserByUsername(username: string) {
  // Find a user whose username matches the given username, or null if no such user exists.
  const q = query(users, where('username', '==', username), limit(1))
  const docs = (await getDocs(q)).docs
  return docs.length > 0 ? docs[0].data() : null
}

export async function setUser(userId: string, user: User) {
  await setDoc(doc(users, userId), user)
}

export async function updateUser(userId: string, update: Partial<User>) {
  await updateDoc(doc(users, userId), { ...update })
}

export async function updatePrivateUser(
  userId: string,
  update: Partial<PrivateUser>
) {
  await updateDoc(doc(privateUsers, userId), { ...update })
}

export function listenForUser(
  userId: string,
  setUser: (user: User | null) => void
) {
  const userRef = doc(users, userId)
  return listenForValue<User>(userRef, setUser)
}

export function listenForPrivateUser(
  userId: string,
  setPrivateUser: (privateUser: PrivateUser | null) => void
) {
  const userRef = doc(privateUsers, userId)
  return listenForValue<PrivateUser>(userRef, setPrivateUser)
}

const CACHED_REFERRAL_USERNAME_KEY = 'CACHED_REFERRAL_KEY'
const CACHED_REFERRAL_CONTRACT_ID_KEY = 'CACHED_REFERRAL_CONTRACT_KEY'
const CACHED_REFERRAL_GROUP_ID_KEY = 'CACHED_REFERRAL_GROUP_KEY'

export function writeReferralInfo(
  defaultReferrerUsername: string,
  contractId?: string,
  referralUsername?: string,
  groupId?: string
) {
  const local = safeLocalStorage()
  const cachedReferralUser = local?.getItem(CACHED_REFERRAL_USERNAME_KEY)
  // Write the first referral username we see.
  if (!cachedReferralUser)
    local?.setItem(
      CACHED_REFERRAL_USERNAME_KEY,
      referralUsername || defaultReferrerUsername
    )

  // If an explicit referral query is passed, overwrite the cached referral username.
  if (referralUsername)
    local?.setItem(CACHED_REFERRAL_USERNAME_KEY, referralUsername)

  // Always write the most recent explicit group invite query value
  if (groupId) local?.setItem(CACHED_REFERRAL_GROUP_ID_KEY, groupId)

  // Write the first contract id that we see.
  const cachedReferralContract = local?.getItem(CACHED_REFERRAL_CONTRACT_ID_KEY)
  if (!cachedReferralContract && contractId)
    local?.setItem(CACHED_REFERRAL_CONTRACT_ID_KEY, contractId)
}

export async function setCachedReferralInfoForUser(user: User | null) {
  if (!user || user.referredByUserId) return
  // if the user wasn't created in the last minute, don't bother
  const now = dayjs().utc()
  const userCreatedTime = dayjs(user.createdTime)
  if (now.diff(userCreatedTime, 'minute') > 5) return

  const local = safeLocalStorage()
  const cachedReferralUsername = local?.getItem(CACHED_REFERRAL_USERNAME_KEY)
  const cachedReferralContractId = local?.getItem(
    CACHED_REFERRAL_CONTRACT_ID_KEY
  )
  const cachedReferralGroupId = local?.getItem(CACHED_REFERRAL_GROUP_ID_KEY)

  // get user via username
  if (cachedReferralUsername)
    getUserByUsername(cachedReferralUsername).then((referredByUser) => {
      if (!referredByUser) return
      // update user's referralId
      updateUser(
        user.id,
        removeUndefinedProps({
          referredByUserId: referredByUser.id,
          referredByContractId: cachedReferralContractId
            ? cachedReferralContractId
            : undefined,
          referredByGroupId: cachedReferralGroupId
            ? cachedReferralGroupId
            : undefined,
        })
      )
        .catch((err) => {
          console.log('error setting referral details', err)
        })
        .then(() => {
          track('Referral', {
            userId: user.id,
            referredByUserId: referredByUser.id,
            referredByContractId: cachedReferralContractId,
            referredByGroupId: cachedReferralGroupId,
          })
        })
    })

  if (cachedReferralGroupId) addUserToGroupViaId(cachedReferralGroupId, user.id)

  local?.removeItem(CACHED_REFERRAL_GROUP_ID_KEY)
  local?.removeItem(CACHED_REFERRAL_USERNAME_KEY)
  local?.removeItem(CACHED_REFERRAL_CONTRACT_ID_KEY)
}

export async function firebaseLogin() {
  const provider = new GoogleAuthProvider()
  return signInWithPopup(auth, provider)
}

export async function firebaseLogout() {
  auth.signOut()
}

const storage = getStorage(app)
// Example: uploadData('avatars/ajfi8iejsf.png', data)
export async function uploadData(
  path: string,
  data: ArrayBuffer | Blob | Uint8Array
) {
  const uploadRef = ref(storage, path)
  // Uploaded files should be cached for 1 day, then revalidated
  // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
  const metadata = { cacheControl: 'public, max-age=86400, must-revalidate' }
  await uploadBytes(uploadRef, data, metadata)
  return await getDownloadURL(uploadRef)
}

export async function listUsers(userIds: string[]) {
  if (userIds.length > 10) {
    throw new Error('Too many users requested at once; Firestore limits to 10')
  }
  const q = query(users, where('id', 'in', userIds))
  const docs = (await getDocs(q)).docs
  return docs.map((doc) => doc.data())
}

export async function listAllUsers() {
  const docs = (await getDocs(users)).docs
  return docs.map((doc) => doc.data())
}

export function getTopTraders(period: Period) {
  const topTraders = query(
    users,
    orderBy('profitCached.' + period, 'desc'),
    limit(20)
  )

  return getValues<User>(topTraders)
}

export function getTopCreators(period: Period) {
  const topCreators = query(
    users,
    orderBy('creatorVolumeCached.' + period, 'desc'),
    limit(20)
  )
  return getValues<User>(topCreators)
}

export async function getTopFollowed() {
  return (await getValues<User>(topFollowedQuery)).slice(0, 20)
}

const topFollowedQuery = query(
  users,
  orderBy('followerCountCached', 'desc'),
  limit(20)
)

export function getUsers() {
  return getValues<User>(users)
}

export async function getUserFeed(userId: string) {
  const feedDoc = doc(privateUsers, userId, 'cache', 'feed')
  const userFeed = await getValue<{
    feed: feed
  }>(feedDoc)
  return userFeed?.feed ?? []
}

export async function getCategoryFeeds(userId: string) {
  const cacheCollection = collection(privateUsers, userId, 'cache')
  const feedData = await Promise.all(
    CATEGORY_LIST.map((category) =>
      getValue<{ feed: feed }>(doc(cacheCollection, `feed-${category}`))
    )
  )
  const feeds = feedData.map((data) => data?.feed ?? [])
  return Object.fromEntries(zip(CATEGORY_LIST, feeds) as [string, feed][])
}

export async function follow(userId: string, followedUserId: string) {
  const followDoc = doc(collection(users, userId, 'follows'), followedUserId)
  await setDoc(followDoc, {
    userId: followedUserId,
    timestamp: Date.now(),
  })
}

export async function unfollow(userId: string, unfollowedUserId: string) {
  const followDoc = doc(collection(users, userId, 'follows'), unfollowedUserId)
  await deleteDoc(followDoc)
}

export async function getPortfolioHistory(userId: string) {
  return getValues<PortfolioMetrics>(
    query(
      collectionGroup(db, 'portfolioHistory'),
      where('userId', '==', userId),
      orderBy('timestamp', 'asc')
    )
  )
}

export function listenForFollows(
  userId: string,
  setFollowIds: (followIds: string[]) => void
) {
  const follows = collection(users, userId, 'follows')
  return listenForValues<{ userId: string }>(follows, (docs) =>
    setFollowIds(docs.map(({ userId }) => userId))
  )
}

export function listenForFollowers(
  userId: string,
  setFollowerIds: (followerIds: string[]) => void
) {
  const followersQuery = query(
    collectionGroup(db, 'follows'),
    where('userId', '==', userId)
  )
  return onSnapshot(
    followersQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return

      const values = snapshot.docs.map((doc) => doc.ref.parent.parent?.id)
      setFollowerIds(filterDefined(values))
    }
  )
}
export function listenForReferrals(
  userId: string,
  setReferralIds: (referralIds: string[]) => void
) {
  const referralsQuery = query(
    collection(db, 'users'),
    where('referredByUserId', '==', userId)
  )
  return onSnapshot(
    referralsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return

      const values = snapshot.docs.map((doc) => doc.ref.id)
      setReferralIds(filterDefined(values))
    }
  )
}
