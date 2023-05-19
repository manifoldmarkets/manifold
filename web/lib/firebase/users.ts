import { Contract } from 'common/contract'
import { PrivateUser, User, UserAndPrivateUser } from 'common/user'
import { filterDefined } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore'
import { postMessageToNative } from 'web/components/native-message-listener'
import { getIsNative } from 'web/lib/native/is-native'
import { nativeSignOut } from 'web/lib/native/native-messages'
import { track } from '../service/analytics'
import { safeLocalStorage } from '../util/local'
import { addGroupMember } from './api'
import { app, db } from './init'
import { coll, getValues, listenForValue, listenForValues } from './utils'

dayjs.extend(utc)

export const users = coll<User>('users')
export const privateUsers = coll<PrivateUser>('private-users')

export type { User }

export type Period = 'daily' | 'weekly' | 'monthly' | 'allTime'

export const auth = getAuth(app)

export async function getUser(userId: string) {
  /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
  return (await getDoc(doc(users, userId))).data()!
}

export async function getPrivateUser(userId: string) {
  // TODO: are we recreating these users a la Polaris or continuing to delete them a la Fede?
  /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
  return (await getDoc(doc(privateUsers, userId))).data()!
}

export async function getUserAndPrivateUser(userId: string) {
  const [user, privateUser] = (
    await Promise.all([
      getDoc(doc(users, userId))!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
      getDoc(doc(privateUsers, userId))!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
    ])
  ).map((d) => d.data()) as [User, PrivateUser]
  return { user, privateUser } as UserAndPrivateUser
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

export async function deletePrivateUser(userId: string) {
  await deleteDoc(doc(privateUsers, userId))
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

// Scenarios:
// 1. User is referred by another user to homepage, group page, market page etc. explicitly via referrer= query param
// 2. User lands on a market or group without a referrer, we attribute the market/group creator
// Explicit referrers take priority over the implicit ones, (e.g. they're overwritten)
export function writeReferralInfo(
  defaultReferrerUsername: string,
  otherOptions?: {
    contractId?: string
    explicitReferrer?: string
    groupId?: string
  }
) {
  const local = safeLocalStorage
  const cachedReferralUser = local?.getItem(CACHED_REFERRAL_USERNAME_KEY)
  const { contractId, explicitReferrer, groupId } = otherOptions || {}

  // Write the first referral username we see.
  if (!cachedReferralUser) {
    local?.setItem(
      CACHED_REFERRAL_USERNAME_KEY,
      explicitReferrer || defaultReferrerUsername
    )
    if (groupId) local?.setItem(CACHED_REFERRAL_GROUP_ID_KEY, groupId)
    if (contractId) local?.setItem(CACHED_REFERRAL_CONTRACT_ID_KEY, contractId)
  }

  // Overwrite all referral info if we see an explicit referrer.
  if (explicitReferrer) {
    local?.setItem(CACHED_REFERRAL_USERNAME_KEY, explicitReferrer)
    if (!groupId) local?.removeItem(CACHED_REFERRAL_GROUP_ID_KEY)
    else local?.setItem(CACHED_REFERRAL_GROUP_ID_KEY, groupId)
    if (!contractId) local?.removeItem(CACHED_REFERRAL_CONTRACT_ID_KEY)
    else local?.setItem(CACHED_REFERRAL_CONTRACT_ID_KEY, contractId)
  }
}

export async function setCachedReferralInfoForUser(user: User | null) {
  if (!user || user.referredByUserId) return
  // if the user wasn't created in the last minute, don't bother
  const now = dayjs().utc()
  const userCreatedTime = dayjs(user.createdTime)
  if (now.diff(userCreatedTime, 'minute') > 5) return

  const local = safeLocalStorage
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

          local?.removeItem(CACHED_REFERRAL_GROUP_ID_KEY)
          local?.removeItem(CACHED_REFERRAL_USERNAME_KEY)
          local?.removeItem(CACHED_REFERRAL_CONTRACT_ID_KEY)

          if (cachedReferralGroupId)
            addGroupMember({ groupId: cachedReferralGroupId, userId: user.id })
        })
    })
}

export async function firebaseLogin() {
  if (getIsNative()) {
    // Post the message back to expo
    postMessageToNative('loginClicked', {})
    return
  }
  const provider = new GoogleAuthProvider()
  return signInWithPopup(auth, provider).then(async (result) => {
    return result
  })
}

export async function firebaseLogout() {
  if (getIsNative()) nativeSignOut()

  await auth.signOut()
}

export async function listAllUsers(
  n: number,
  before?: string,
  sortDescBy = 'createdTime'
): Promise<User[]> {
  let q = query(users, orderBy(sortDescBy, 'desc'), limit(n))
  if (before != null) {
    const snap = await getDoc(doc(users, before))
    q = query(q, startAfter(snap))
  }
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => doc.data())
}

export function getUsers() {
  return getValues<User>(users)
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

export const getUsersBlockFacetFilters = (
  privateUser: PrivateUser | undefined | null,
  excludeGroupSlugs?: boolean
) => {
  let facetFilters: string[] = []
  if (!privateUser) return facetFilters
  facetFilters = facetFilters.concat(
    privateUser.blockedUserIds.map(
      (blockedUserId) => `creatorId:-${blockedUserId}`
    )
  )
  facetFilters = facetFilters.concat(
    privateUser.blockedByUserIds.map(
      (blockedUserId) => `creatorId:-${blockedUserId}`
    )
  )
  if (!excludeGroupSlugs)
    facetFilters = facetFilters.concat(
      privateUser.blockedGroupSlugs.map(
        (blockedUserId) => `groupSlugs:-${blockedUserId}`
      )
    )
  facetFilters = facetFilters.concat(
    privateUser.blockedContractIds.map(
      (blockedUserId) => `id:-${blockedUserId}`
    )
  )
  return facetFilters
}

export const isContractBlocked = (
  privateUser: PrivateUser | undefined | null,
  contract: Contract
) => {
  if (!privateUser) return false

  const {
    blockedContractIds,
    blockedByUserIds,
    blockedUserIds,
    blockedGroupSlugs,
  } = privateUser

  return (
    blockedContractIds?.includes(contract.id) ||
    contract.groupSlugs?.some((slug) => blockedGroupSlugs?.includes(slug)) ||
    blockedByUserIds?.includes(contract.creatorId) ||
    blockedUserIds?.includes(contract.creatorId)
  )
}

export async function getTotalContractCreated(userId: string) {
  const resp = await getCountFromServer(
    query(collection(db, 'contracts'), where('creatorId', '==', userId))
  )
  return resp.data().count
}
