import { Contract } from 'common/contract'
import {
  humanish,
  MINUTES_ALLOWED_TO_REFER,
  PrivateUser,
  User,
} from 'common/user'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import {
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
  signInWithPopup,
} from 'firebase/auth'
import { getIsNative } from 'web/lib/native/is-native'
import { nativeSignOut } from 'web/lib/native/native-messages'
import { app } from './init'
import { postMessageToNative } from 'web/lib/native/post-message'

dayjs.extend(utc)

export type { User }

export const auth = getAuth(app)

export const CACHED_REFERRAL_USERNAME_KEY = 'CACHED_REFERRAL_KEY'
const CACHED_REFERRAL_CONTRACT_ID_KEY = 'CACHED_REFERRAL_CONTRACT_KEY'

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

export async function loginWithApple() {
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')

  return signInWithPopup(auth, provider)
    .then((result) => {
      return result
    })
    .catch((error) => {
      console.error(error)
    })
}

export async function firebaseLogout() {
  if (getIsNative()) nativeSignOut()

  await auth.signOut()
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

export const canSetReferrer = (user: User) => {
  if (user.referredByUserId) return false
  if (!humanish(user)) return false
  const now = dayjs().utc()
  const userCreatedTime = dayjs(user.createdTime)
  return now.diff(userCreatedTime, 'minute') < MINUTES_ALLOWED_TO_REFER
}
