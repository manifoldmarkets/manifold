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
}
