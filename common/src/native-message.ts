import { GPSData } from 'common/gidx/gidx'
import { Notification } from 'common/notification'

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
