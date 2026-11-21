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
// - Pin saves run one at a time; the last one sends the latest pins. A save is
//   only sent while the signed-in user owns the profile. If it fails, the
//   server's pins are shown again.

type Entry = {
  data?: UserTrophies
  error?: Error
  // Claims this page added, with the claimsVersion at which each was added.
  localClaims: { claim: TrophyClaim; version: number }[]
  claimsVersion: number
  pinsVersion: number // bumped by each local pin change
  confirmedPins?: string[] | null // the server's pins, as last seen
  loading?: Promise<void>
  saving?: Promise<void>
  savePending: boolean
}

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

const getEntry = (userId: string): Entry =>
  entries.get(userId) ?? {
    localClaims: [],
    claimsVersion: 0,
    pinsVersion: 0,
    savePending: false,
  }

const setEntry = (userId: string, patch: Partial<Entry>) => {
  entries.set(userId, { ...getEntry(userId), ...patch })
  listeners.get(userId)?.forEach((listener) => listener())
}

const claimKey = (c: TrophyClaim) => `${c.trophyId}/${c.milestoneId}`

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
  const loading = api('get-user-trophies', { userId })
    .then((fresh) => {
      const current = getEntry(userId)
      const newerLocalClaims = current.localClaims.filter(
        (l) => l.version > startClaimsVersion
      )
      const pinsBusy =
        current.pinsVersion !== startPinsVersion ||
        current.savePending ||
        (!!current.saving && !forPinRecovery)
      setEntry(userId, {
        data: {
          ...fresh,
          claims: mergeClaims(
            fresh.claims,
            newerLocalClaims.map((l) => l.claim)
          ),
          pins: pinsBusy && current.data ? current.data.pins : fresh.pins,
        },
        localClaims: newerLocalClaims,
        confirmedPins: pinsBusy ? current.confirmedPins : fresh.pins,
        error: undefined,
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
    })
  setEntry(userId, { loading })
  return loading
}

/** Adds claims returned by claim-trophy. */
export function addTrophyClaims(userId: string, claims: TrophyClaim[]) {
  const entry = getEntry(userId)
  if (!entry.data) return
  const version = entry.claimsVersion + 1
  setEntry(userId, {
    data: { ...entry.data, claims: mergeClaims(entry.data.claims, claims) },
    claimsVersion: version,
    localClaims: [
      ...entry.localClaims,
      ...claims.map((claim) => ({ claim, version })),
    ],
  })
}

/** Replaces claims after an admin unclaim, which also removes the pin. */
export function replaceTrophyClaims(userId: string, claims: TrophyClaim[]) {
  const entry = getEntry(userId)
  if (!entry.data) return
  setEntry(userId, {
    data: {
      ...entry.data,
      claims,
      pins: pinsWithClaims(entry.data.pins, claims),
    },
    claimsVersion: entry.claimsVersion + 1,
    localClaims: [],
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
      if (auth.currentUser?.uid !== userId) {
        showConfirmedPins(userId)
        break
      }
      const pins = getEntry(userId).data?.pins ?? []
      try {
        await api('set-showcase-pins', { pins })
        setEntry(userId, { confirmedPins: pins })
      } catch (e) {
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
  })().finally(() => setEntry(userId, { saving: undefined }))
  setEntry(userId, { saving })
}

export function useUserTrophies(userId: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(userId)
      if (!set) {
        set = new Set()
        listeners.set(userId, set)
      }
      set.add(listener)
      return () => {
        const current = listeners.get(userId)
        current?.delete(listener)
        if (current && current.size === 0) listeners.delete(userId)
      }
    },
    [userId]
  )
  const getSnapshot = useCallback(() => entries.get(userId), [userId])
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  // Refetch on each mount, so the profile is fresh when revisited.
  useEffect(() => {
    loadUserTrophies(userId)
  }, [userId])

  return { trophies: entry?.data, error: entry?.error }
}
