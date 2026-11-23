import { useCallback, useEffect, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'

import { APIResponse } from 'common/api/schema'
import {
  LEAGUE_SHOWCASE_PIN,
  TrophyClaim,
  getTrophyIdFromPin,
} from 'common/trophies'
import { api } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'

export type UserTrophies = APIResponse<'get-user-trophies'>

// One user's claimed milestones and profile pins, shared live by every
// component showing them (the Trophies tab and the profile showcase).
//
// - A load replaces the claims with the server's, plus any this page added
//   after the load started, so a slow load cannot hide a new claim and an
//   unclaim made elsewhere still shows up.
// - Pins are last-write-wins, and the user's latest choice wins: a load never
//   replaces pins that changed since it started or are still being saved.
// - Pin saves run one at a time; the last one sends the latest pins. A save
//   names the profile, and the API refuses it unless that is the signed-in
//   user. If it fails, the server's pins are shown again.
// - Profiles nobody is showing are forgotten beyond MAX_IDLE, once nothing is
//   loading or saving for them; a later visit reads them again. A claim that
//   returns after its profile was forgotten waits for that read.
// - Read again on each visit, and when the page regains focus once the last
//   read is FRESH_MS old. Navigation can reuse a fresh read across pages.

type Entry = {
  data?: UserTrophies
  error?: Error
  // Claims this page added, with the claimsVersion at which each was added.
  localClaims: { claim: TrophyClaim; version: number }[]
  claimsVersion: number
  // claimsVersion of the last admin unclaim; loads started before it keep
  // the claims it returned.
  replacedAtVersion: number
  pinsVersion: number // bumped by each local pin change
  pinsSaves: number // bumped when each save settles
  confirmedPins?: string[] | null // the server's pins, as last seen
  loading?: Promise<void>
  saving?: Promise<void>
  savePending: boolean
  lastUsed: number
  loadedAt?: number
  // Rewards a claim reported while there was no data, for the next read.
  localRewarded?: UserTrophies['rewarded']
}

const MAX_IDLE = 20
const FRESH_MS = 30_000

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

const getEntry = (userId: string): Entry =>
  entries.get(userId) ?? {
    localClaims: [],
    claimsVersion: 0,
    replacedAtVersion: 0,
    pinsVersion: 0,
    pinsSaves: 0,
    savePending: false,
    lastUsed: Date.now(),
  }

const setEntry = (userId: string, patch: Partial<Entry>) => {
  entries.set(userId, { ...getEntry(userId), ...patch })
  listeners.get(userId)?.forEach((listener) => listener())
}

const claimKey = (c: TrophyClaim) => `${c.trophyId}/${c.milestoneId}`

type MilestoneRef = { trophyId: string; milestoneId: string }
const mergeRefs = (a: MilestoneRef[], b: MilestoneRef[]) => {
  const byKey = new Map(a.map((r) => [claimKey({ ...r, claimedTime: 0 }), r]))
  for (const r of b) {
    const key = claimKey({ ...r, claimedTime: 0 })
    if (!byKey.has(key)) byKey.set(key, r)
  }
  return [...byKey.values()]
}

const mergeClaims = (a: TrophyClaim[], b: TrophyClaim[]) => {
  const byKey = new Map(a.map((c) => [claimKey(c), c]))
  for (const c of b) if (!byKey.has(claimKey(c))) byKey.set(claimKey(c), c)
  return [...byKey.values()]
}

// Pins of trophies that still have a claim, and the league badge.
const pinsWithClaims = (pins: string[] | null, claims: TrophyClaim[]) => {
  if (pins === null) return null
  const claimed = new Set(claims.map((c) => c.trophyId))
  return pins.filter((pin) => {
    if (pin === LEAGUE_SHOWCASE_PIN) return true
    const trophyId = getTrophyIdFromPin(pin)
    return !!trophyId && claimed.has(trophyId)
  })
}

// `forPinRecovery`: called by the save loop after a failed save, to show the
// server's pins even though the loop is still running.
function loadUserTrophies(userId: string, forPinRecovery = false) {
  const entry = getEntry(userId)
  if (entry.loading && !forPinRecovery) return entry.loading
  const startClaimsVersion = entry.claimsVersion
  const startPinsVersion = entry.pinsVersion
  const startPinsSaves = entry.pinsSaves
  const loading = api('get-user-trophies', { userId })
    .then((response) => {
      // An API from before starter rewards (stage 1, e.g. mid-deploy) sends
      // neither field.
      const fresh: UserTrophies = {
        ...response,
        starter: response.starter ?? null,
        rewarded: response.rewarded ?? [],
      }
      const current = getEntry(userId)
      const newerLocalClaims = current.localClaims.filter(
        (l) => l.version > startClaimsVersion
      )
      // A save that settled while this load ran may have changed the pins
      // after the server read them.
      const pinsBusy =
        current.pinsVersion !== startPinsVersion ||
        current.savePending ||
        (!forPinRecovery &&
          (!!current.saving || current.pinsSaves !== startPinsSaves))
      const replacedSinceStart =
        current.replacedAtVersion > startClaimsVersion && !!current.data
      setEntry(userId, {
        data: {
          ...fresh,
          claims: replacedSinceStart
            ? current.data?.claims ?? fresh.claims
            : mergeClaims(
                fresh.claims,
                newerLocalClaims.map((l) => l.claim)
              ),
          pins: pinsBusy && current.data ? current.data.pins : fresh.pins,
          // Paid rewards are never removed; keep any this page added.
          rewarded: mergeRefs(fresh.rewarded, [
            ...(current.data?.rewarded ?? []),
            ...(current.localRewarded ?? []),
          ]),
        },
        localClaims: newerLocalClaims,
        confirmedPins: pinsBusy ? current.confirmedPins : fresh.pins,
        error: undefined,
        loadedAt: Date.now(),
        localRewarded: undefined,
      })
    })
    .catch((e) => {
      setEntry(userId, {
        error: e instanceof Error ? e : new Error(String(e)),
      })
    })
    .finally(() => {
      if (getEntry(userId).loading === loading) {
        setEntry(userId, { loading: undefined })
      }
      pruneIdle()
    })
  setEntry(userId, { loading })
  return loading
}

export async function refreshUserTrophies(userId: string) {
  // A read already in flight may have taken its snapshot before rollover.
  await getEntry(userId).loading
  return loadUserTrophies(userId)
}

/** Adds claims returned by claim-trophy. */
export function addTrophyClaims(userId: string, claims: TrophyClaim[]) {
  const entry = getEntry(userId)
  const version = entry.claimsVersion + 1
  setEntry(userId, {
    // With no data yet (the profile was forgotten while the claim was in
    // flight), the claims wait in localClaims for the next read to merge.
    ...(entry.data && {
      data: { ...entry.data, claims: mergeClaims(entry.data.claims, claims) },
    }),
    claimsVersion: version,
    localClaims: [
      ...entry.localClaims,
      ...claims.map((claim) => ({ claim, version })),
    ],
  })
}

/** Adds paid starter rewards returned by claim-trophy. Rewards are never
 * removed, so they merge. */
export function addTrophyRewards(
  userId: string,
  // Missing from a stage 1 API's response (mid-deploy).
  rewardedOrMissing: UserTrophies['rewarded'] | undefined
) {
  const rewarded = rewardedOrMissing ?? []
  const entry = getEntry(userId)
  if (!entry.data) {
    // The profile was forgotten while the claim was in flight.
    setEntry(userId, {
      localRewarded: mergeRefs(entry.localRewarded ?? [], rewarded),
    })
    return
  }
  setEntry(userId, {
    data: {
      ...entry.data,
      rewarded: mergeRefs(entry.data.rewarded, rewarded),
    },
  })
}

/** Replaces claims after an admin unclaim, which also removes the pin. */
export function replaceTrophyClaims(userId: string, claims: TrophyClaim[]) {
  const entry = getEntry(userId)
  if (!entry.data) return
  const version = entry.claimsVersion + 1
  setEntry(userId, {
    data: {
      ...entry.data,
      claims,
      pins: pinsWithClaims(entry.data.pins, claims),
    },
    claimsVersion: version,
    replacedAtVersion: version,
    localClaims: [],
    pinsVersion: entry.pinsVersion + 1,
    confirmedPins:
      entry.confirmedPins === undefined
        ? undefined
        : pinsWithClaims(entry.confirmedPins, claims),
  })
}

/** Shows the new pins at once and saves them in the background. */
export function setShowcasePins(userId: string, pins: string[]) {
  const entry = getEntry(userId)
  if (!entry.data) return
  setEntry(userId, {
    data: { ...entry.data, pins },
    pinsVersion: entry.pinsVersion + 1,
    savePending: true,
  })
  if (!entry.saving) savePinsUntilCurrent(userId)
}

const showConfirmedPins = (userId: string) => {
  const entry = getEntry(userId)
  if (!entry.data || entry.confirmedPins === undefined) return
  setEntry(userId, {
    data: { ...entry.data, pins: entry.confirmedPins },
    pinsVersion: entry.pinsVersion + 1,
  })
}

function savePinsUntilCurrent(userId: string) {
  const saving = (async () => {
    while (getEntry(userId).savePending) {
      setEntry(userId, { savePending: false })
      // The signed-in account may have changed since the pins were chosen.
      // (No Firebase user, e.g. before the session restores or in local-only
      // mode: send, and the API decides.)
      const signedIn = auth.currentUser?.uid
      if (signedIn && signedIn !== userId) {
        showConfirmedPins(userId)
        break
      }
      const pins = getEntry(userId).data?.pins ?? []
      try {
        await api('set-showcase-pins', { userId, pins })
        setEntry(userId, {
          confirmedPins: pins,
          pinsSaves: getEntry(userId).pinsSaves + 1,
        })
      } catch (e) {
        setEntry(userId, { pinsSaves: getEntry(userId).pinsSaves + 1 })
        toast.error(e instanceof Error ? e.message : String(e))
        if (getEntry(userId).savePending) continue // a newer choice saves next
        await getEntry(userId).loading
        if (getEntry(userId).savePending) continue
        await loadUserTrophies(userId, true)
        // If the server couldn't be read either, show its last known pins.
        if (getEntry(userId).error && !getEntry(userId).savePending) {
          showConfirmedPins(userId)
        }
      }
    }
  })().finally(() => {
    setEntry(userId, { saving: undefined })
    pruneIdle()
  })
  setEntry(userId, { saving })
}

// Forget the least recently shown profiles beyond MAX_IDLE. One still loading
// or saving is kept, so its result has somewhere to land.
const pruneIdle = () => {
  const idle = [...entries.entries()]
    .filter(
      ([id, e]) =>
        !listeners.has(id) && !e.loading && !e.saving && !e.savePending
    )
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
  for (const [id] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE))) {
    entries.delete(id)
  }
}

export function useUserTrophies(
  userId: string | undefined,
  onMount: 'always' | 'if-stale' = 'always'
) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!userId) return () => {}
      let set = listeners.get(userId)
      if (!set) {
        set = new Set()
        listeners.set(userId, set)
      }
      set.add(listener)
      return () => {
        const current = listeners.get(userId)
        current?.delete(listener)
        if (current && current.size === 0) {
          listeners.delete(userId)
          const entry = entries.get(userId)
          if (entry) entries.set(userId, { ...entry, lastUsed: Date.now() })
          pruneIdle()
        }
      }
    },
    [userId]
  )
  const getSnapshot = useCallback(
    () => (userId ? entries.get(userId) : undefined),
    [userId]
  )
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  // Refetch on each mount, so the profile is fresh when revisited, and on
  // focus once FRESH_MS old.
  useEffect(() => {
    if (!userId) return
    const loadIfStale = () => {
      const { loadedAt } = getEntry(userId)
      if (loadedAt === undefined || Date.now() - loadedAt >= FRESH_MS) {
        loadUserTrophies(userId)
      }
    }
    if (onMount === 'always') loadUserTrophies(userId)
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
  }, [userId, onMount])

  return { trophies: entry?.data, error: entry?.error }
}
