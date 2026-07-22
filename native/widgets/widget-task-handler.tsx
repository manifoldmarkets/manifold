import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { CONFIGS } from 'common/envs/constants'
import type { NativeStreakData } from 'common/native-message'
import { getData } from 'lib/auth'
import { fetchStreakSnapshot } from '../lib/streak-widget'
import { ENV } from '../init'
import {
  pacificStartOfDayMs,
  renderStreakWidget,
  STREAK_WIDGET_NAME,
} from './streak-widget'
import {
  loadQuestSnapshot,
  loadStreakSnapshot,
  saveStreakSnapshot,
} from './widget-storage'

// When the stored snapshot predates today's Pacific midnight, the app hasn't
// re-synced since the streak rollover — so an overnight freeze may have been
// applied server-side that we can't see. The render's local prediction covers the
// common has-a-freeze case, but a fresh fetch also catches a lost streak and a
// snapshot stale by more than a day, and confirms the exact freeze count. One
// successful fetch bumps updatedAt past midnight, closing this gate until the
// next rollover. Best-effort: any failure keeps the stored snapshot (the render
// still applies the prediction).
async function refreshIfStale(
  data: NativeStreakData | null
): Promise<NativeStreakData | null> {
  try {
    if (!data?.loggedIn) return data
    if (data.updatedAt >= pacificStartOfDayMs(new Date())) return data
    const user = await getData<{ uid?: string }>('user')
    if (!user?.uid) return data
    const fresh = await fetchStreakSnapshot(CONFIGS[ENV].apiEndpoint, user.uid)
    if (!fresh) return data
    await saveStreakSnapshot(fresh)
    return fresh
  } catch {
    return data
  }
}

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
      const [stored, quests] = await Promise.all([
        loadStreakSnapshot(),
        loadQuestSnapshot(),
      ])
      const data = await refreshIfStale(stored)
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
