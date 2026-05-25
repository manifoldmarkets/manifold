import { useEvent } from 'client-common/hooks/use-event'
import {
  PUSH_MODAL_RECENT_MS,
  STORE_REVIEW_COOLDOWN_MS,
  StoreReviewReason,
} from 'common/store-review'
import { usePrivateUser } from 'web/hooks/use-user'
import { postMessageToNative } from 'web/lib/native/post-message'
import { track } from 'web/lib/service/analytics'
import { useNativeInfo } from 'web/components/native-message-provider'

type BlockedBy = 'not-native' | 'opt-out' | 'cooldown' | 'push-modal-recent'

// Module-level guard so two trigger sites (e.g. bet-panel + contract-page)
// firing within the same second can't both burn an Apple silent-cap slot
// before the optimistic lastAppReviewTime write round-trips through the API
// and AuthContext refetch. Cleared on full page reload (acceptable: the
// server's lastAppReviewTime takes over by then).
let localLastFireTime = 0

const evaluateEligibility = (
  isNative: boolean,
  privateUser: NonNullable<ReturnType<typeof usePrivateUser>>
): { eligible: true } | { eligible: false; blockedBy: BlockedBy } => {
  if (!isNative) return { eligible: false, blockedBy: 'not-native' }
  if (privateUser.optOutAppReviewPrompts === true)
    return { eligible: false, blockedBy: 'opt-out' }

  const serverLast = privateUser.lastAppReviewTime ?? 0
  const effectiveLast = Math.max(serverLast, localLastFireTime)
  if (Date.now() - effectiveLast < STORE_REVIEW_COOLDOWN_MS)
    return { eligible: false, blockedBy: 'cooldown' }

  const lastPushModal = privateUser.lastPromptedToEnablePushNotifications ?? 0
  if (Date.now() - lastPushModal < PUSH_MODAL_RECENT_MS)
    return { eligible: false, blockedBy: 'push-modal-recent' }

  return { eligible: true }
}

export const useStoreReviewNudge = (reason: StoreReviewReason) => {
  const { isNative } = useNativeInfo()
  const privateUser = usePrivateUser()

  return useEvent(() => {
    // Silently no-op while privateUser is hydrating. Caller is expected to
    // also gate on privateUser-defined.
    if (!privateUser) return

    // Web users are always blocked by 'not-native'; emitting a telemetry event
    // for every contract-page mount, every notifications-list render, etc.
    // would drown out the eligible cohort with predictable noise.
    if (!isNative) return

    const result = evaluateEligibility(isNative, privateUser)

    if (!result.eligible) {
      track('review_prompt_attempt', {
        reason,
        eligible: false,
        blockedBy: result.blockedBy,
      })
      return
    }

    localLastFireTime = Date.now()
    track('review_prompt_attempt', { reason, eligible: true })
    postMessageToNative('hasReviewActionRequested', { reason })
  })
}
