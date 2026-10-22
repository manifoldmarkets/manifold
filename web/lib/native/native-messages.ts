import { NativeQuestData, NativeStreakData } from 'common/native-message'
import { postMessageToNative } from 'web/lib/native/post-message'

export const nativePassUsers = (userJson: string) => {
  postMessageToNative('users', userJson)
}
export const nativeSignOut = () => {
  postMessageToNative('signOut', {})
}
// Pushes the current streak snapshot to the native app for the streak widget.
// No-ops on web (postMessageToNative guards on getIsNative()).
export const nativeSetStreak = (streak: NativeStreakData) => {
  postMessageToNative('setStreak', streak)
}
// Pushes the current quest completion to the native app for the streak widget.
export const nativeSetQuests = (quests: NativeQuestData) => {
  postMessageToNative('setQuests', quests)
}
// Android-only: asks the native app to show the system "add widget to home
// screen" dialog. No-ops on web (postMessageToNative guards on getIsNative());
// the native side no-ops on iOS.
export const nativePinStreakWidget = () => {
  postMessageToNative('pinStreakWidget', {})
}

// The first app version whose BINARY contains the streak widget: the iOS SwiftUI
// widget target, the Android AppWidget, and the WidgetPin native module that
// handles `pinStreakWidget`. Web deploys the moment this merges but the binary
// reaches users days later via the stores, so widget-specific web UI must gate on
// it. Keep in sync with `version` in native/app.config.js.
//
// If the two stores ever ship the widget under different version numbers, this
// must be the LOWEST of them — raising it would switch the UI off for users on
// the platform that shipped first.
export const MIN_WIDGET_APP_VERSION = '2.1.0'

// Numeric per-segment compare of dotted version strings. A plain string compare
// gets this wrong — '2.0.9' > '2.0.71' lexicographically, but 2.0.71 is the newer
// app. Missing segments count as 0, so '2.1' satisfies '2.1.0'. Returns false for
// '' / undefined / unparseable, so callers fail CLOSED both while the
// versionRequested handshake is outstanding and for binaries too old to answer it.
export const isAtLeastVersion = (
  version: string | undefined,
  minVersion: string
) => {
  if (!version) return false
  // Note the explicit arrow: .map(parseInt) would pass the index as the radix.
  const parse = (v: string) => v.split('.').map((p) => parseInt(p, 10))
  const actual = parse(version)
  if (actual.some((n) => isNaN(n))) return false
  const min = parse(minVersion)
  for (let i = 0; i < Math.max(actual.length, min.length); i++) {
    const a = actual[i] ?? 0
    const b = min[i] ?? 0
    if (a !== b) return a > b
  }
  return true
}
