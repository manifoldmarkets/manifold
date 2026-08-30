import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { CONFIGS } from 'common/envs/constants'
import { mayPersistStreakSnapshot } from 'common/streak-snapshot'
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
    // A sign-out during the fetch clears the stored user. Without this check we'd
    // persist the old account's snapshot with a fresh updatedAt, which also closes
    // the staleness gate above — so a signed-out phone would keep rendering that
    // streak indefinitely. iOS can't hit this (no headless fetch; clearStreakWidget
    // is final there), so leaving it would be a real lockstep divergence. Returning
    // null renders 'loggedOut', matching index.swift's loadStreakData guard.
    //
    // Checked BEFORE any other post-fetch return: `data` is the signed-out
    // account's snapshot, so returning it anywhere below would repaint the streak
    // we just cleared.
    const current = await getData<{ uid?: string }>('user')
    if (current?.uid !== user.uid) return null
    if (!fresh) return data
    // Around the rollover the API can still answer with the day-that-just-ended's
    // row, before the backend's midnight job has reached this user. Saving that
    // stamps pre-reset data with a fresh updatedAt, which closes the gate above
    // for the rest of the day AND disqualifies predictOvernight. Keep the older
    // snapshot instead: its prediction is right, and the next update retries.
    if (!mayPersistStreakSnapshot(fresh, new Date())) return data
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
    // Fired by the rollover alarm, seconds after the streak day turns over.
    //
    // Deliberately does NOT refresh. The backend's own midnight job may not have
    // run yet, so the API can still answer with the previous day's row — and
    // saving that would stamp pre-reset data with a post-midnight updatedAt,
    // which both closes refreshIfStale's staleness gate and disqualifies
    // predictOvernight (it requires a snapshot synced during the day that just
    // ended). The widget would then show an unconsumed freeze, or a streak that
    // has actually died, until the app was next opened.
    //
    // Rendering the stored snapshot instead lets predictOvernight replay the
    // reset locally and leaves updatedAt stale, so the next ordinary
    // WIDGET_UPDATE still fetches and confirms.
    case 'WIDGET_ROLLOVER' as typeof widgetAction: {
      const [stored, quests] = await Promise.all([
        loadStreakSnapshot(),
        loadQuestSnapshot(),
      ])
      renderWidget(renderStreakWidget(widgetInfo, stored, quests))
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
