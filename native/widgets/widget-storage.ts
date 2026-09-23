import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NativeQuestData, NativeStreakData } from 'common/native-message'

// Where the Android widget snapshots live. The iOS widget reads an App Group
// (ExtensionStorage); Android has no equivalent, so we mirror the same snapshots
// into AsyncStorage. The headless widget task handler reads these when the OS asks
// the widget to redraw while the app is closed (reboot, periodic update, resize).
export const STREAK_WIDGET_STORAGE_KEY = 'streakWidgetData'
export const QUEST_WIDGET_STORAGE_KEY = 'streakWidgetQuests'

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

// Secondary daily/weekly quests shown as rows on the medium widget. Stored
// separately from the streak so either can update without clobbering the other.
export async function saveQuestSnapshot(data: NativeQuestData): Promise<void> {
  await AsyncStorage.setItem(QUEST_WIDGET_STORAGE_KEY, JSON.stringify(data))
}

export async function loadQuestSnapshot(): Promise<NativeQuestData | null> {
  try {
    const raw = await AsyncStorage.getItem(QUEST_WIDGET_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as NativeQuestData
  } catch {
    return null
  }
}

export async function clearQuestSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(QUEST_WIDGET_STORAGE_KEY)
}
