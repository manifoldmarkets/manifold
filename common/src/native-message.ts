import { GPSData } from 'common/gidx/gidx'
import { Notification } from 'common/notification'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
} from 'common/economy'
import { getEffectiveTier, User } from 'common/user'
import { getEffectiveBonusMultiplier } from 'common/supporter-config'

export type nativeToWebMessageType =
  | 'iapReceipt'
  | 'iapError'
  | 'nativeFbUser'
  | 'pushNotificationPermissionStatus'
  | 'pushToken'
  | 'notification'
  | 'link'
  | 'location'
  | 'locationPermissionStatus'
  | 'hasReviewAction'
  | 'version'
  // Native asks the web to re-push quest completion to the streak widget (sent on
  // app-foreground, since quest scores aren't on the public API the native streak
  // sync uses). Payload is empty.
  | 'refreshQuests'
export type nativeToWebMessage = {
  type: nativeToWebMessageType
  data: any
}

export type webToNativeMessage = {
  type: webToNativeMessageType
  data: any
}

export type webToNativeMessageType =
  | 'checkout'
  | 'openUrl'
  | 'tryToGetPushTokenWithoutPrompt'
  | 'loginClicked'
  | 'copyToClipboard'
  | 'promptEnablePushNotifications'
  | 'signOut'
  | 'users'
  | 'error'
  | 'onPageVisit'
  | 'share'
  | 'theme'
  | 'log'
  | 'startedListening'
  | 'locationRequested'
  | 'locationPermissionStatusRequested'
  | 'storeReviewRequested'
  | 'hasReviewActionRequested'
  | 'versionRequested'
  | 'setAppUrl'
  | 'copyImageToClipboard'
  | 'setStreak'
  | 'setQuests'
  // Android-only: ask the native app to show the system "add widget to home
  // screen" dialog for the streak widget (AppWidgetManager.requestPinAppWidget).
  // No-ops on iOS (no such API) and on web. Payload is empty.
  | 'pinStreakWidget'
export const IS_NATIVE_KEY = 'is-native'
export const PLATFORM_KEY = 'native-platform'

// Streak snapshot sent to the native app, which mirrors it into a shared App
// Group container for the home/lock-screen streak widget to read. All times are
// ms-epoch; 0 means "never". The widget recomputes lit/pending/frozen state
// itself from these vs. the next midnight-Pacific reset, so it stays correct
// even hours after this snapshot was written.
export type NativeStreakData = {
  loggedIn: boolean
  streak: number
  lastBetTime: number // 0 if never bet
  lastStreakFreezeTime: number // 0 if no freeze ever used
  freezesLeft: number // == user.streakForgiveness
  updatedAt: number // when this snapshot was taken
  // Today's streak bonus with the tier's streak multiplier applied — shown on
  // the widget as "+M50 / day". Optional so legacy blobs stay decodable.
  streakBonus?: number
}

// The daily betting-streak bonus for the widget, streak multiplier applied —
// the same formula the streak progress bar shows. Computed wherever the full
// user object lives (web setStreak push AND the native API self-fetch) so the
// snapshot stays correct whichever path wrote it last.
export function streakBonusPerDay(user: User): number {
  const base = Math.min(
    BETTING_STREAK_BONUS_AMOUNT * Math.max(user.currentBettingStreak ?? 0, 1),
    BETTING_STREAK_BONUS_MAX
  )
  return Math.floor(
    base * getEffectiveBonusMultiplier(getEffectiveTier(user), 'streak')
  )
}

// A single widget quest. State is binary (done this period or not). `period`
// tells the widget when to reset `done` back to false on its own: 'daily' rolls
// at midnight PT, 'weekly' at Monday midnight PT (matching the backend reset
// jobs). The streak quest is the widget's main display, so it's not included
// here — only the secondary quest rows.
export type NativeQuestItem = {
  title: string
  rewardMana: number
  done: boolean
  period: 'daily' | 'weekly'
}

export type NativeQuestData = {
  quests: NativeQuestItem[]
  updatedAt: number
  // Supporter-tier badge shown above the quest rewards ("PRO ×2"), present
  // only when the user has a paid multiplier. Display-ready so tier renames
  // don't need an app update; `color` picks the widget's metallic gradient.
  tier?: {
    label: string // e.g. 'PLUS' | 'PRO' | 'PREMIUM'
    multiplier: number // e.g. 1.5 | 2 | 3
    color: 'silver' | 'indigo' | 'amber'
  }
}

export type MesageTypeMap = {
  version: {
    version: string | undefined
  }
  hasReviewAction: {
    hasAction: boolean
    isAvailable: boolean
    reason?: string
  }
  locationPermissionStatus: {
    status: 'granted' | 'denied' | 'undetermined'
  }
  location: GPSData | { error: string }
  iapReceipt: { receipt: string }
  iapError: object
  nativeFbUser: object
  pushNotificationPermissionStatus: {
    status: 'denied' | 'undetermined'
  }
  pushToken: {
    token: string
  }
  notification: Notification
  link: {
    url: string
  }
  refreshQuests: object
}
