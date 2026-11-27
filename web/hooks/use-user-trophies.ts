import { useCallback, useEffect, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'

import { getLocalOnlyUserId } from 'common/util/api'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'
import {
  ANON_VIEWER,
  type UserTrophies,
  createUserTrophiesStore,
} from './user-trophies-store'

export type { UserTrophies }

// The store of every profile's trophies this page has read (see
// user-trophies-store for its rules), wired to the API and the session.

const FRESH_MS = 30_000

// Who api() sends as: the local user in local-only mode, otherwise the
// Firebase user. get-user-trophies sends the owner more than anyone else, so
// the store keeps what each viewer was sent apart.
const getViewerId = () =>
  getLocalOnlyUserId() ?? auth.currentUser?.uid ?? ANON_VIEWER

const store = createUserTrophiesStore({
  load: (userId) => api('get-user-trophies', { userId }),
  savePins: (userId, pins) => api('set-showcase-pins', { userId, pins }),
  getViewerId,
  whenViewerKnown: () => auth.authStateReady(),
  onSaveError: (message) => toast.error(message),
})

export const refreshUserTrophies = store.refresh
/** Adds claims returned by claim-trophy. */
export const addTrophyClaims = store.addClaims
/** Adds the paid milestones returned by claim-trophy. */
export const addTrophyRewards = store.addRewards
/** Replaces claims after an admin unclaim, which also removes the pin. */
export const replaceTrophyClaims = store.replaceClaims
/** Shows the new pins at once and saves them in the background. */
export const setShowcasePins = store.setPins

// The viewer, or undefined until Firebase has restored the session: before
// that a signed-in viewer still looks anonymous, and a read made then would
// be filed under the wrong viewer.
let viewerKnown = false
const subscribeToViewer = (listener: () => void) => {
  let subscribed = true
  void auth.authStateReady().then(() => {
    viewerKnown = true
    if (subscribed) listener()
  })
  const unsubscribe = auth.onAuthStateChanged(() => listener())
  return () => {
    subscribed = false
    unsubscribe()
  }
}
const getViewerSnapshot = () => (viewerKnown ? getViewerId() : undefined)

export function useUserTrophies(
  userId: string | undefined,
  onMount: 'always' | 'if-stale' = 'always',
  freshMs = FRESH_MS
) {
  const viewerId = useSyncExternalStore(
    subscribeToViewer,
    getViewerSnapshot,
    () => undefined
  )
  // Local-only mode sets its user with no Firebase event. The app's user
  // changing renders this hook again, which reads the viewer again.
  useUser()
  // The profile and who is looking at it: a sign-in, a sign-out or an account
  // switch moves to another entry, and reads it as the new viewer.
  const key = userId && viewerId ? store.keyOf(userId, viewerId) : undefined

  const subscribe = useCallback(
    (listener: () => void) => (key ? store.subscribe(key, listener) : () => {}),
    [key]
  )
  const getSnapshot = useCallback(
    () => (key ? store.getSnapshot(key) : undefined),
    [key]
  )
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  useEffect(() => {
    if (!userId || !key) return
    const loadIfStale = () => store.loadIfStale(userId, key, freshMs)
    if (onMount === 'always') void store.load(userId, key)
    else loadIfStale()
    const onFocus = () => {
      if (document.visibilityState === 'visible') loadIfStale()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId, key, onMount, freshMs])

  return {
    trophies: entry?.data,
    error: entry?.error,
    loading: !!entry?.loading,
  }
}
