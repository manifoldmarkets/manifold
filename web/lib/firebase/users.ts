import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

import { Contract } from 'common/contract'
import { MINUTES_ALLOWED_TO_REFER, PrivateUser, User } from 'common/user'
import { sleep } from 'common/util/time'
import { shouldSendCachedReferral } from 'common/welcome-flow'
import { getIsNative } from 'web/lib/native/is-native'
import { nativeSignOut } from 'web/lib/native/native-messages'
import { postMessageToNative } from 'web/lib/native/post-message'
import { clearPushToken } from 'web/lib/supabase/notifications'
import { api, APIError } from '../api/api'
import { safeLocalStorage } from '../util/local'
import { getFirebaseAuth } from './auth'

dayjs.extend(utc)

export type { User }

export const auth = getFirebaseAuth()
export const CACHED_REFERRAL_USERNAME_KEY = 'CACHED_REFERRAL_KEY'
const CACHED_REFERRAL_CONTRACT_ID_KEY = 'CACHED_REFERRAL_CONTRACT_KEY'
const CACHED_REFERRAL_EXPLICIT_KEY = 'CACHED_REFERRAL_EXPLICIT'
const REFERRAL_COMPLETE_KEY = 'referral-complete'

export function getCachedReferralInfo() {
  if (safeLocalStorage?.getItem(REFERRAL_COMPLETE_KEY) === 'true') return
  const username = safeLocalStorage?.getItem(CACHED_REFERRAL_USERNAME_KEY)
  if (!username) return
  return {
    username,
    contractId:
      safeLocalStorage?.getItem(CACHED_REFERRAL_CONTRACT_ID_KEY) ?? undefined,
    // Older caches have no flag and keep the original payout rules.
    explicit:
      safeLocalStorage?.getItem(CACHED_REFERRAL_EXPLICIT_KEY) === 'true',
  }
}

// Keep the first implicit referrer. An explicit invitation replaces it.
export function writeReferralInfo(
  defaultReferrerUsername: string,
  options?: { contractId?: string; explicitReferrer?: string }
) {
  const { contractId, explicitReferrer } = options ?? {}
  if (
    !explicitReferrer &&
    safeLocalStorage?.getItem(CACHED_REFERRAL_USERNAME_KEY)
  )
    return
  safeLocalStorage?.setItem(
    CACHED_REFERRAL_USERNAME_KEY,
    explicitReferrer || defaultReferrerUsername
  )
  safeLocalStorage?.setItem(
    CACHED_REFERRAL_EXPLICIT_KEY,
    String(!!explicitReferrer)
  )
  if (contractId)
    safeLocalStorage?.setItem(CACHED_REFERRAL_CONTRACT_ID_KEY, contractId)
  else safeLocalStorage?.removeItem(CACHED_REFERRAL_CONTRACT_ID_KEY)
}

// The new user removed the invitation we prefilled: send nothing for it.
export function clearCachedReferralInfo() {
  safeLocalStorage?.removeItem(CACHED_REFERRAL_USERNAME_KEY)
  safeLocalStorage?.removeItem(CACHED_REFERRAL_CONTRACT_ID_KEY)
  safeLocalStorage?.removeItem(CACHED_REFERRAL_EXPLICIT_KEY)
}

export async function sendReferral(
  referredByUsername: string,
  contractId?: string
) {
  await api('refer-user', {
    referredByUsername,
    ...(contractId && { contractId }),
  })
  safeLocalStorage?.setItem(REFERRAL_COMPLETE_KEY, 'true')
}

const pendingCachedReferrals = new Map<string, Promise<void>>()

export async function setCachedReferralInfoForUser(
  user: User,
  { allowImplicit }: { allowImplicit: boolean }
) {
  if (!canSetReferrer(user)) return
  const cached = getCachedReferralInfo()
  if (
    !cached ||
    !shouldSendCachedReferral({
      explicit: cached.explicit,
      onImplicitReferralPage: allowImplicit,
      pastOnboarding: !user.shouldShowWelcome,
    })
  )
    return

  const pending = pendingCachedReferrals.get(user.id)
  if (pending) return pending
  const request = sendReferral(cached.username, cached.contractId)
    .catch((error) => {
      // Welcome runs on every page, so a referral the server will never
      // accept (unknown referrer, already referred, too old) must not be
      // retried on each page load. Network and server errors still retry.
      if (error instanceof APIError && error.code >= 400 && error.code < 500)
        safeLocalStorage?.setItem(REFERRAL_COMPLETE_KEY, 'true')
      console.error('Error setting cached referral', error)
    })
    .finally(() => pendingCachedReferrals.delete(user.id))
  pendingCachedReferrals.set(user.id, request)
  return request
}

// Best-effort, time-bounded clear of the current account's push token before an
// auth change (logout or account switch), so the device stops receiving
// notifications for that account. Only runs on native (push tokens are
// mobile-only) and only when signed in. Never blocks the auth change for more
// than a moment on a flaky network — the backend reclaim in set-push-token is
// the durable backstop if this best-effort call doesn't land.
async function clearPushTokenBeforeAuthChange() {
  if (!getIsNative() || !auth.currentUser) return
  // Handle errors on the call itself so a rejection arriving after the timeout
  // below doesn't surface as an unhandled rejection.
  const clear = clearPushToken().catch((e) =>
    console.error('error clearing push token before auth change', e)
  )
  // Best-effort: don't let a slow network block the auth change. The backend
  // reclaim in set-push-token is the durable backstop.
  await Promise.race([clear, sleep(2000)])
}

export async function firebaseLogin() {
  if (getIsNative()) {
    // If we're switching accounts, clear the outgoing account's push token.
    // Fire-and-forget so the login flow isn't delayed; the set-push-token
    // reclaim when the next account registers is the durable backstop.
    void clearPushTokenBeforeAuthChange()
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
  if (getIsNative()) {
    // Clear this account's push token while still authenticated, so the device
    // stops receiving notifications for the account being logged out.
    await clearPushTokenBeforeAuthChange()
    nativeSignOut()
  }

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
  // Attribution must happen at signup so the referrer can be paid later when
  // the referred user bets or verifies. Don't gate on bonus eligibility here:
  // brand-new users haven't completed iDenfy yet, but we still want to record
  // who referred them. The bonus payout itself is gated separately.
  if (user.referredByUserId) return false
  const now = dayjs().utc()
  const userCreatedTime = dayjs(user.createdTime)
  return now.diff(userCreatedTime, 'minute') < MINUTES_ALLOWED_TO_REFER
}
