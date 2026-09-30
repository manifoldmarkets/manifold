import { useEvent } from 'client-common/hooks/use-event'
import { useEffect, useSyncExternalStore } from 'react'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'

type Click = { userId?: string; value: boolean }

// This tab's last click, shared by every mounted toggle (the Trades tab and
// the trades modal can both be open).
let lastClick: Click | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const setLastClick = (click: Click | undefined) => {
  lastClick = click
  listeners.forEach((listener) => listener())
}

// Saves run one at a time in click order, so quick toggling can't leave the
// account on an earlier click. Each is skipped if the account that clicked is
// no longer signed in, since api() sends whoever is signed in when it runs.
let saving: Promise<unknown> = Promise.resolve()

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
  // A click is shown until the account value catches up with it. It only
  // counts for whoever made it, so after signing in the account's value wins.
  const clicked = click?.userId === user?.id ? click?.value : undefined

  // Only a change to the account value clears the click, so a quick on/off
  // doesn't flicker while its saves come back. Once cleared, changes made in
  // other tabs show through.
  useEffect(() => {
    if (user && clicked === saved) setLastClick(undefined)
  }, [saved])

  const setHideApiTrades = useEvent((enabled: boolean) => {
    const userId = user?.id
    setLastClick({ userId, value: enabled })
    if (userId)
      saving = saving
        .then(() =>
          auth.currentUser?.uid === userId
            ? api('me/update', { hideApiTrades: enabled })
            : undefined
        )
        .catch(() => {})
  })

  return [clicked ?? saved, setHideApiTrades] as const
}
