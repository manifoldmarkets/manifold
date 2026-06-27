import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NativeStreakData } from 'common/native-message'

// Where the Android widget snapshot lives. The iOS widget reads an App Group
// (ExtensionStorage); Android has no equivalent, so we mirror the same snapshot
// into AsyncStorage. The headless widget task handler reads this when the OS asks
// the widget to redraw while the app is closed (reboot, periodic update, resize).
export const STREAK_WIDGET_STORAGE_KEY = 'streakWidgetData'

export async function saveStreakSnapshot(data: NativeStreakData): Promise<void> {
  await AsyncStorage.setItem(STREAK_WIDGET_STORAGE_KEY, JSON.stringify(data))
}

export async function loadStreakSnapshot(): Promise<NativeStreakData | null> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_WIDGET_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as NativeStreakData
  } catch {
    return null
  }
}
