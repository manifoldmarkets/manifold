import { useEvent } from 'client-common/hooks/use-event'
import {
  applyLocalUserUpdate,
  trackUserChanges,
} from 'client-common/hooks/use-websocket-user'
import { APIError } from 'common/api/utils'
import { getLocalOnlyUserId } from 'common/util/api'
import { useEffect, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'

/** On/off settings saved on the account through me/update. */
export type AccountToggleField = 'hideApiTrades' | 'showOrderBook'

// userId: the account the click is for, or null for a signed-out visitor. It's
// undefined if it was made before it was known who's signed in.
// saved: this click's own me/update has gone through.
type Click = { userId?: string | null; value: boolean; saved?: boolean }

// Who api() sends as: the local user in local-only mode, otherwise the
// Firebase user once its session has been restored on page load.
const apiUserId = async () => {
  await auth.authStateReady()
  return getLocalOnlyUserId() ?? auth.currentUser?.uid
}

/**
 * A hook for an on/off setting that every toggle using it shares. For
 * signed-in users it's saved to their account, and me/update broadcasts the
 * change to their open tabs, so it sticks across pages, tabs, devices and
 * reloads. Signed-out users keep it in memory until they reload.
 *
 * onSaveError: 'revert' puts the switch back and says so, so a failed save
 * doesn't look like it stuck (right for a filter). 'keep' leaves it as
 * clicked for this session (right for a view the user wants open now).
 */
export function createAccountToggle(
  field: AccountToggleField,
  options: { label: string; onSaveError: 'revert' | 'keep' }
) {
  // This tab's last click, shared by every mounted toggle (e.g. the Trades tab
  // and the trades modal can both be open).
  let lastClick: Click | undefined
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      // Some clicks only wait while a view that uses them is mounted. With
      // none left, the account value takes over:
      // - a saved click waits for the account value to catch up, so it can't
      //   hide a change made later in another tab or device;
      // - one made before it was known who's signed in waits to be handed to
      //   them (see the hook below), so it can't go to someone who signs in
      //   later instead.
      // Checked once the commit is done, so a view replacing this one in the
      // same render (e.g. moving straight to another market) still counts.
      queueMicrotask(() => {
        if (
          !listeners.size &&
          lastClick &&
          (lastClick.saved || lastClick.userId === undefined)
        )
          lastClick = undefined
      })
    }
  }
  const skipSubscribe = () => () => {}
  const setLastClick = (click: Click | undefined) => {
    lastClick = click
    listeners.forEach((listener) => listener())
  }

  // Saves run one at a time in click order, so quick toggling can't leave the
  // account on an earlier click. Each is skipped, and its click dropped,
  // unless api() is about to send it as the account that clicked, which may
  // have switched since.
  let saving: Promise<unknown> = Promise.resolve()

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
        // What reaches the account from the request until it's been handled:
        // its own broadcast, and changes from other tabs or devices.
        const changes = trackUserChanges(userId)
        try {
          let stored = false
          try {
            const updated = await api('me/update', { [field]: value })
            // An API that doesn't know the setting yet accepts the request but
            // drops it, so check it was actually stored.
            stored = !!updated[field] === value
          } catch (e) {
            // An account that isn't allowed to save it (e.g. one banned from
            // posting) keeps the click for the session, like a signed-out
            // visitor.
            if (e instanceof APIError && e.code === 403) return
          }
          if (!stored) {
            // A 'keep' setting stays as clicked for this session. Otherwise
            // the switch goes back to the saved value, so a failed save
            // doesn't look like it stuck.
            if (lastClick === click && options.onSaveError === 'revert') {
              setLastClick(undefined)
              toast.error(`Couldn't save ${options.label}. Please try again.`)
            }
            return
          }
          // The last await, so nothing can arrive unseen between reading what
          // arrived below and the tracker stopping.
          const stillSignedIn = (await apiUserId()) === userId
          const values = changes.updates
            .filter((update) => field in update)
            .map((update) => update[field])
          // If nothing for it reached the account while saving (its broadcast
          // is late or missed), the account value gets it anyway, so it's
          // still there once the click is dropped.
          if (!values.length)
            applyLocalUserUpdate({ id: userId, [field]: value })
          // If the last value that did arrive is different, it may be a newer
          // change from another tab or device. Without a server version
          // there's no telling, so it's left in place and shows right away.
          const superseded =
            !!values.length && values[values.length - 1] !== value
          // Otherwise the click waits for the account value to match, but only
          // while a view using it is mounted (see subscribe) and its account
          // is still the one signed in.
          const keep = !!listeners.size && !superseded && stillSignedIn
          if (lastClick === click)
            setLastClick(keep ? { ...click, saved: true } : undefined)
        } finally {
          changes.stop()
        }
      })
      .catch(() => {})
  }

  // inUse: whether the caller acts on the value. One that doesn't (a topic
  // page's activity log) doesn't watch clicks, so it can't keep one alive.
  return function useAccountToggle(inUse = true) {
    const user = useUser()
    const authorized = useIsAuthorized()
    // undefined until it's known who's signed in, and null if no one is.
    // During a sign-in or account switch, the previous user can still be
    // showing.
    const userId =
      authorized === undefined ? undefined : authorized ? user?.id : null
    const saved = !!user?.[field]
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

    // The click is shown until its own save is in and the account value
    // matches it, or no view using it is left mounted. An earlier click's save
    // landing first can't clear it, so quick toggling doesn't flicker. Once
    // it's dropped, changes made in other tabs and devices show through.
    useEffect(() => {
      if (clickSaved && clicked === saved) setLastClick(undefined)
    }, [saved, clickSaved])

    // Once it's known who's signed in, a click made before then is theirs,
    // and it's saved like any other.
    useEffect(() => {
      if (userId !== undefined && lastClick && lastClick.userId === undefined)
        applyClick({ userId, value: lastClick.value })
    }, [userId])

    const setValue = useEvent((enabled: boolean) =>
      applyClick({ userId, value: enabled })
    )

    return [clicked ?? saved, setValue] as const
  }
}
