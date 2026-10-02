import { useEvent } from 'client-common/hooks/use-event'
import { getLocalOnlyUserId } from 'common/util/api'
import { useEffect, useSyncExternalStore } from 'react'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'

// saved: this click's own me/update has gone through.
type Click = { userId?: string; value: boolean; saved?: boolean }

// This tab's last click, shared by every mounted toggle (the Trades tab and
// the trades modal can both be open).
let lastClick: Click | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    // A saved click only waits for the account value to catch up while a
    // toggle is showing it. With none left, the account value takes over, so
    // the click can't hide a change made later in another tab or device.
    // Checked once the commit is done, so a toggle replacing this one in the
    // same render (e.g. moving straight to another market) still counts.
    queueMicrotask(() => {
      if (!listeners.size && lastClick?.saved) lastClick = undefined
    })
  }
}
const setLastClick = (click: Click | undefined) => {
  lastClick = click
  listeners.forEach((listener) => listener())
}

// Saves run one at a time in click order, so quick toggling can't leave the
// account on an earlier click. Each is skipped, and its click dropped, unless
// api() is about to send it as the account that clicked, which may have
// switched since.
let saving: Promise<unknown> = Promise.resolve()

// Who api() sends as: the local user in local-only mode, otherwise the
// Firebase user once its session has been restored on page load.
const apiUserId = async () => {
  await auth.authStateReady()
  return getLocalOnlyUserId() ?? auth.currentUser?.uid
}

// Every "Hide API trades" toggle shares one value. For signed-in users it's
// saved to their account, and me/update broadcasts the change to their open
// tabs, so it sticks across markets, tabs, devices and reloads. Signed-out
// users keep it in memory until they reload.
export const useHideApiTrades = () => {
  const user = useUser()
  const saved = !!user?.hideApiTrades
  const click = useSyncExternalStore(
    subscribe,
    () => lastClick,
    () => undefined
  )
  // A click only counts for whoever made it, so after signing in the
  // account's value wins.
  const ownClick = click?.userId === user?.id ? click : undefined
  const clicked = ownClick?.value
  const clickSaved = !!ownClick?.saved

  // The click is shown until its own save is in and the account value matches
  // it, or no toggle is left on screen. An earlier click's save landing first
  // can't clear it, so quick toggling doesn't flicker. Once it's dropped,
  // changes made in other tabs and devices show through.
  useEffect(() => {
    if (clickSaved && clicked === saved) setLastClick(undefined)
  }, [saved, clickSaved])

  const setHideApiTrades = useEvent((enabled: boolean) => {
    const userId = user?.id
    const click: Click = { userId, value: enabled }
    setLastClick(click)
    if (!userId) return
    saving = saving
      .then(async () => {
        if ((await apiUserId()) !== userId) {
          // Unsaved, so it mustn't override the account's value if it signs
          // back in.
          if (lastClick === click) setLastClick(undefined)
          return
        }
        await api('me/update', { hideApiTrades: enabled })
        // With no toggle on screen there's nothing to wait for (see subscribe).
        if (lastClick === click)
          setLastClick(listeners.size ? { ...click, saved: true } : undefined)
      })
      .catch(() => {})
  })

  return [clicked ?? saved, setHideApiTrades] as const
}
