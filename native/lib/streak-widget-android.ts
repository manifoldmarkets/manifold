import { requestWidgetUpdate } from 'react-native-android-widget'
import type { WidgetInfo } from 'react-native-android-widget'
import { NativeStreakData } from 'common/native-message'
import { log } from 'components/logger'
import { renderStreakWidget, STREAK_WIDGET_NAME } from '../widgets/streak-widget'
import { saveStreakSnapshot } from '../widgets/widget-storage'

// Android implementation of the streak widget data layer. Imported lazily (via
// require) from lib/streak-widget.ts only on Android, so the widget library and
// JSX are never loaded on iOS. Persists the snapshot (for headless redraws) and
// pushes an immediate update to every on-screen instance.

export const writeAndroidStreakWidget = (data: NativeStreakData) => {
  saveStreakSnapshot(data).catch((e) => log('Error saving streak snapshot', e))
  requestWidgetUpdate({
    widgetName: STREAK_WIDGET_NAME,
    renderWidget: (info: WidgetInfo) => renderStreakWidget(info, data),
    widgetNotFound: () => {},
  }).catch((e) => log('Error updating android streak widget', e))
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
  requestWidgetUpdate({
    widgetName: STREAK_WIDGET_NAME,
    renderWidget: (info: WidgetInfo) => renderStreakWidget(info, null),
    widgetNotFound: () => {},
  }).catch((e) => log('Error clearing android streak widget', e))
}
