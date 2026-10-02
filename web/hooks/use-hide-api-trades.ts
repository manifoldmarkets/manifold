import { useEvent } from 'client-common/hooks/use-event'
import { applyLocalUserUpdate } from 'client-common/hooks/use-websocket-user'
import { APIError } from 'common/api/utils'
import { getLocalOnlyUserId } from 'common/util/api'
import { useEffect, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'

// userId: the account the click is for, or null for a signed-out visitor. It's
// undefined if it was made before it was known who's signed in.
// saved: this click's own me/update has gone through.
type Click = { userId?: string | null; value: boolean; saved?: boolean }

// This tab's last click, shared by every mounted toggle (the Trades tab and
// the trades modal can both be open).
let lastClick: Click | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    // A saved click only waits for the account value to catch up while a list
    // that uses it is mounted. With none left, the account value takes over,
    // so the click can't hide a change made later in another tab or device.
    // Checked once the commit is done, so a list replacing this one in the
    // same render (e.g. moving straight to another market) still counts.
    queueMicrotask(() => {
      if (!listeners.size && lastClick?.saved) lastClick = undefined
    })
  }
}
const skipSubscribe = () => () => {}
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

// Shows the click in every toggle and, if it's for an account, saves it.
const applyClick = (click: Click) => {
  setLastClick(click)
  const { userId, value } = click
  if (!userId) return
  saving = saving
    .then(async () => {
      if ((await apiUserId()) !== userId) {
        // Unsaved, so it mustn't override the account's value if it signs
        // back in.
        if (lastClick === click) setLastClick(undefined)
        return
      }
      try {
        await api('me/update', { hideApiTrades: value })
      } catch (e) {
        // An account that isn't allowed to save it (e.g. one banned from
        // posting) keeps the click for the session, like a signed-out visitor.
        // Otherwise the switch goes back to the saved value, so a failed save
        // doesn't look like it stuck.
        if (lastClick === click && !(e instanceof APIError && e.code === 403)) {
          setLastClick(undefined)
          toast.error("Couldn't save Hide API trades. Please try again.")
        }
        return
      }
      // The account value gets it even if the broadcast is missed, so it's
      // still there once the click is dropped.
      applyLocalUserUpdate({ id: userId, hideApiTrades: value })
      // With no list using it there's nothing to wait for (see subscribe).
      if (lastClick === click)
        setLastClick(listeners.size ? { ...click, saved: true } : undefined)
    })
    .catch(() => {})
}

// Every "Hide API trades" toggle shares one value. For signed-in users it's
// saved to their account, and me/update broadcasts the change to their open
// tabs, so it sticks across markets, tabs, devices and reloads. Signed-out
// users keep it in memory until they reload.
// inUse: whether the caller filters by the value. One that doesn't (a topic
// page's activity log) doesn't watch clicks, so it can't keep one alive.
export const useHideApiTrades = (inUse = true) => {
  const user = useUser()
  // undefined until it's known who's signed in, and null if no one is.
  const userId = user === undefined ? undefined : user?.id ?? null
  const saved = !!user?.hideApiTrades
  const click = useSyncExternalStore(
    inUse ? subscribe : skipSubscribe,
    () => (inUse ? lastClick : undefined),
    () => undefined
  )
  // A click only counts for whoever made it, so after signing in the
  // account's value wins. One made before it was known who's signed in
  // counts for whoever turns out to be.
  const ownClick =
    click?.userId === undefined || click.userId === userId ? click : undefined
  const clicked = ownClick?.value
  const clickSaved = !!ownClick?.saved

  // The click is shown until its own save is in and the account value matches
  // it, or no list using it is left mounted. An earlier click's save landing
  // first can't clear it, so quick toggling doesn't flicker. Once it's
  // dropped, changes made in other tabs and devices show through.
  useEffect(() => {
    if (clickSaved && clicked === saved) setLastClick(undefined)
  }, [saved, clickSaved])

  // Once it's known who's signed in, a click made before then is theirs, and
  // it's saved like any other.
  useEffect(() => {
    if (userId !== undefined && lastClick && lastClick.userId === undefined)
      applyClick({ userId, value: lastClick.value })
  }, [userId])

  const setHideApiTrades = useEvent((enabled: boolean) =>
    applyClick({ userId, value: enabled })
  )

  return [clicked ?? saved, setHideApiTrades] as const
}
