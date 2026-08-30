import { ExtensionStorage } from '@bacons/apple-targets'
import {
  NativeQuestData,
  NativeStreakData,
  streakBonusPerDay,
} from 'common/native-message'
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
  if (Platform.OS === 'android') {
    require('./streak-widget-android').writeAndroidQuestWidget(data)
    return
  }
  if (!storage) return
  try {
    storage.set(QUEST_KEY, data as any)
    ExtensionStorage.reloadWidget(WIDGET_KIND)
  } catch (e) {
    log('Error writing quest widget data', e)
  }
}

// Fetches the user's streak from the public user/by-id API and maps it to a
// widget snapshot. Shared by the app's foreground sync (App.tsx) and the Android
// headless widget task, so the field mapping + streak-bonus formula live in one
// place. Returns null on any failure (offline, non-200, bad JSON, timeout) — the
// caller keeps the existing snapshot. The timeout matters for the headless task:
// a hung request would otherwise stall the widget redraw.
export async function fetchStreakSnapshot(
  apiEndpoint: string,
  userId: string,
  timeoutMs = 6000
): Promise<NativeStreakData | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://${apiEndpoint}/v0/user/by-id/${userId}`,
      { signal: controller.signal }
    )
    if (!res.ok) return null
    const u = await res.json()
    return {
      loggedIn: true,
      streak: u.currentBettingStreak ?? 0,
      lastBetTime: u.lastBetTime ?? 0,
      lastStreakFreezeTime: u.lastStreakFreezeTime ?? 0,
      freezesLeft: u.streakForgiveness ?? 0,
      streakBonus: streakBonusPerDay(u),
      updatedAt: Date.now(),
    }
  } catch (e) {
    log('Error fetching streak snapshot', e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Drops quest rows (e.g. on sign-out); the widget falls back to streak-only.
export const clearQuestWidget = () => {
  if (Platform.OS === 'android') {
    require('./streak-widget-android').clearAndroidQuestWidget()
    return
  }
  if (!storage) return
  try {
    storage.remove(QUEST_KEY)
    ExtensionStorage.reloadWidget(WIDGET_KIND)
  } catch (e) {
    log('Error clearing quest widget data', e)
  }
}
