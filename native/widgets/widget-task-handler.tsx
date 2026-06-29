import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { renderStreakWidget, STREAK_WIDGET_NAME } from './streak-widget'
import { loadQuestSnapshot, loadStreakSnapshot } from './widget-storage'

// Headless task the OS invokes to (re)draw the widget when the app isn't the one
// driving the update — on add, on resize, on reboot, on periodic refresh. It
// reads the last snapshot the app persisted and renders from it. Registered in
// index.js (Android only).
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetInfo, widgetAction, renderWidget } = props
  if (widgetInfo.widgetName !== STREAK_WIDGET_NAME) return

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const [data, quests] = await Promise.all([
        loadStreakSnapshot(),
        loadQuestSnapshot(),
      ])
      renderWidget(renderStreakWidget(widgetInfo, data, quests))
      break
    }
    case 'WIDGET_CLICK':
      // Tap-to-open-app is wired in a later pass.
      break
    case 'WIDGET_DELETED':
    default:
      break
  }
}
