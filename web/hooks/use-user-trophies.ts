import { useCallback, useEffect, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'

import { APIResponse } from 'common/api/schema'
import { TrophyClaim } from 'common/trophies'
import { api } from 'web/lib/api/api'

export type UserTrophies = APIResponse<'get-user-trophies'>

// One user's claimed milestones and profile pins, shared live by every
// component showing them (the Trophies tab and the profile showcase).
//
// - Claims only grow (apart from an admin's unclaim, which replaces them), so
//   a load merges its claims with the ones already here. A slow load that
//   started before a claim cannot remove it.
// - Pins are last-write-wins. A load that started before a local pin change
//   keeps the local pins.
// - Pin saves run one at a time, and the last one sends the latest pins, so
//   the server ends with what the user last chose.

type Entry = {
  data?: UserTrophies
  error?: Error
  pinsVersion: number // bumped by each local pin change
  loading?: Promise<void>
  saving?: Promise<void>
  savePending: boolean
}

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

const getEntry = (userId: string): Entry => {
  let entry = entries.get(userId)
  if (!entry) {
    entry = { pinsVersion: 0, savePending: false }
    entries.set(userId, entry)
  }
  return entry
}

const setEntry = (userId: string, patch: Partial<Entry>) => {
  entries.set(userId, { ...getEntry(userId), ...patch })
  listeners.get(userId)?.forEach((listener) => listener())
}

const claimKey = (c: TrophyClaim) => `${c.trophyId}/${c.milestoneId}`

export const mergeClaims = (a: TrophyClaim[], b: TrophyClaim[]) => {
  const byKey = new Map(a.map((c) => [claimKey(c), c]))
  for (const c of b) if (!byKey.has(claimKey(c))) byKey.set(claimKey(c), c)
  return [...byKey.values()]
}

function loadUserTrophies(userId: string) {
  const entry = getEntry(userId)
  if (entry.loading) return entry.loading
  const pinsVersionAtStart = entry.pinsVersion
  const loading = api('get-user-trophies', { userId })
    .then((fresh) => {
      const current = getEntry(userId)
      const keepLocalPins =
        current.data && current.pinsVersion !== pinsVersionAtStart
      setEntry(userId, {
        data: {
          ...fresh,
          claims: mergeClaims(current.data?.claims ?? [], fresh.claims),
          pins: keepLocalPins ? current.data?.pins ?? null : fresh.pins,
        },
        error: undefined,
      })
    })
    .catch((e) => {
      setEntry(userId, {
        error: e instanceof Error ? e : new Error(String(e)),
      })
    })
    .finally(() => setEntry(userId, { loading: undefined }))
  setEntry(userId, { loading })
  return loading
}

/** Adds claims returned by claim-trophy. */
export function addTrophyClaims(userId: string, claims: TrophyClaim[]) {
  const { data } = getEntry(userId)
  if (!data) return
  setEntry(userId, {
    data: { ...data, claims: mergeClaims(data.claims, claims) },
  })
}

/** Replaces claims, after an admin unclaim. */
export function replaceTrophyClaims(userId: string, claims: TrophyClaim[]) {
  const { data } = getEntry(userId)
  if (!data) return
  setEntry(userId, { data: { ...data, claims } })
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

function savePinsUntilCurrent(userId: string) {
  const saving = (async () => {
    while (getEntry(userId).savePending) {
      setEntry(userId, { savePending: false })
      const pins = getEntry(userId).data?.pins ?? []
      try {
        await api('set-showcase-pins', { pins })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
        // Show what the server has. A newer local change, if any, saves next.
        if (!getEntry(userId).savePending) {
          // A load already running may keep the local pins; wait it out.
          await getEntry(userId).loading
          setEntry(userId, { pinsVersion: getEntry(userId).pinsVersion + 1 })
          await loadUserTrophies(userId)
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
        set?.delete(listener)
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
