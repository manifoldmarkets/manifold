import { requestWidgetUpdate } from 'react-native-android-widget'
import type { WidgetInfo } from 'react-native-android-widget'
import { NativeQuestData, NativeStreakData } from 'common/native-message'
import { log } from 'components/logger'
import { renderStreakWidget, STREAK_WIDGET_NAME } from '../widgets/streak-widget'
import {
  clearQuestSnapshot,
  loadQuestSnapshot,
  loadStreakSnapshot,
  saveQuestSnapshot,
  saveStreakSnapshot,
} from '../widgets/widget-storage'

// Android implementation of the streak + quest widget data layer. Imported lazily
// (via require) from lib/streak-widget.ts only on Android, so the widget library
// and JSX are never loaded on iOS. Persists each snapshot (for headless redraws)
// and pushes an immediate update to every on-screen instance. The widget needs
// BOTH snapshots to render (streak hero + quest rows), so each writer loads its
// counterpart from storage before redrawing.

const pushUpdate = (
  streak: NativeStreakData | null,
  quests: NativeQuestData | null
) =>
  requestWidgetUpdate({
    widgetName: STREAK_WIDGET_NAME,
    renderWidget: (info: WidgetInfo) => renderStreakWidget(info, streak, quests),
    widgetNotFound: () => {},
  }).catch((e) => log('Error updating android streak widget', e))

export const writeAndroidStreakWidget = (data: NativeStreakData) => {
  saveStreakSnapshot(data).catch((e) => log('Error saving streak snapshot', e))
  loadQuestSnapshot()
    .then((quests) => pushUpdate(data, quests))
    .catch((e) => log('Error reading quests for streak update', e))
}

export const writeAndroidQuestWidget = (data: NativeQuestData) => {
  saveQuestSnapshot(data).catch((e) => log('Error saving quest snapshot', e))
  loadStreakSnapshot()
    .then((streak) => pushUpdate(streak, data))
    .catch((e) => log('Error reading streak for quest update', e))
}

export const clearAndroidStreakWidget = () => {
  const cleared: NativeStreakData = {
    loggedIn: false,
    streak: 0,
    lastBetTime: 0,
    lastStreakFreezeTime: 0,
    freezesLeft: 0,
    updatedAt: Date.now(),
  }
  saveStreakSnapshot(cleared).catch((e) =>
    log('Error clearing streak snapshot', e)
  )
  // Signed out → drop quests too; render the logged-out state.
  clearQuestSnapshot().catch((e) => log('Error clearing quest snapshot', e))
  pushUpdate(null, null)
}

export const clearAndroidQuestWidget = () => {
  clearQuestSnapshot().catch((e) => log('Error clearing quest snapshot', e))
  loadStreakSnapshot()
    .then((streak) => pushUpdate(streak, null))
    .catch((e) => log('Error reading streak for quest clear', e))
}
