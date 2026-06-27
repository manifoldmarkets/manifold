import { ExtensionStorage } from '@bacons/apple-targets'
import { NativeQuestData, NativeStreakData } from 'common/native-message'
import { Platform } from 'react-native'
import { log } from 'components/logger'

// Shared App Group container the streak widget reads from. Must match the
// `com.apple.security.application-groups` entitlement on BOTH the app and the
// widget target (app.config.js + targets/widget/expo-target.config.js), and the
// suiteName the Swift Provider opens (targets/widget/index.swift).
export const STREAK_APP_GROUP = 'group.com.markets.manifold'
const STREAK_KEY = 'streakData'
const QUEST_KEY = 'questData'
// Must match the widget `kind` in index.swift (StaticConfiguration kind).
const WIDGET_KIND = 'StreakWidget'

// iOS-only: the ExtensionStorage native module no-ops on Android, but there's
// no widget there anyway, so skip the work entirely.
const storage =
  Platform.OS === 'ios' ? new ExtensionStorage(STREAK_APP_GROUP) : null

// Writes the streak snapshot into the App Group and refreshes the widget. The
// widget computes lit/pending/frozen itself from these fields, so we just mirror
// the raw numbers.
export const writeStreakWidget = (data: NativeStreakData) => {
  if (Platform.OS === 'android') {
    require('./streak-widget-android').writeAndroidStreakWidget(data)
    return
  }
  if (!storage) return
  try {
    // set() is typed for string|number values, but the native setObject path
    // JSON-serializes the whole object (booleans included) just fine.
    storage.set(STREAK_KEY, data as any)
    ExtensionStorage.reloadWidget(WIDGET_KIND)
  } catch (e) {
    log('Error writing streak widget data', e)
  }
}

// Flips the widget to its logged-out state (e.g. on sign-out).
export const clearStreakWidget = () => {
  if (Platform.OS === 'android') {
    require('./streak-widget-android').clearAndroidStreakWidget()
    return
  }
  if (!storage) return
  try {
    storage.set(STREAK_KEY, { loggedIn: false } as any)
    ExtensionStorage.reloadWidget(WIDGET_KIND)
  } catch (e) {
    log('Error clearing streak widget data', e)
  }
}

// Writes the quest completion the widget renders as secondary rows. The widget
// resets each quest to "not done" on its own once the period rolls over.
export const writeQuestWidget = (data: NativeQuestData) => {
  if (!storage) return
  try {
    storage.set(QUEST_KEY, data as any)
    ExtensionStorage.reloadWidget(WIDGET_KIND)
  } catch (e) {
    log('Error writing quest widget data', e)
  }
}

// Drops quest rows (e.g. on sign-out); the widget falls back to streak-only.
export const clearQuestWidget = () => {
  if (!storage) return
  try {
    storage.remove(QUEST_KEY)
    ExtensionStorage.reloadWidget(WIDGET_KIND)
  } catch (e) {
    log('Error clearing quest widget data', e)
  }
}
