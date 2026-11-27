import type { APIResponse } from 'common/api/schema'
import {
  LEAGUE_SHOWCASE_PIN,
  TrophyClaim,
  getTrophyIdFromPin,
} from 'common/trophies'

export type UserTrophies = APIResponse<'get-user-trophies'>

// One user's claimed milestones and profile pins, shared live by every
// component showing them in navigation or on the profile. No React and no
// Firebase here: use-user-trophies wires the store to the API and the session.
//
// - An entry belongs to one viewer of one profile. get-user-trophies answers
//   the profile's owner and everyone else differently (the private starter
//   stats), so what one viewer was sent is never shown to another: after a
//   sign-in, a sign-out or an account switch the page reads again as the new
//   viewer. A response that arrives after such a change stays with the viewer
//   who asked.
// - A load replaces the claims with the server's, plus any this page added
//   after the load started, so a slow load cannot hide a new claim and an
//   unclaim made elsewhere still shows up.
// - Pins are last-write-wins, and the user's latest choice wins: a load never
//   replaces pins that changed since it started or are still being saved.
// - Pin saves run one at a time; the last one sends the latest pins. A save
//   names the profile, and the API refuses it unless that is the signed-in
//   user. If it fails, the server's pins are shown again.
// - Entries nobody is showing are forgotten beyond MAX_IDLE, once nothing is
//   loading or saving for them; a later visit reads them again. A claim that
//   returns after its entry was forgotten waits for that read.
// - Mounts that request cached data and focus events use the caller's
//   freshness window. Profile views can still request a read on every mount.

export type UserTrophiesEntry = {
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

export type UserTrophiesStoreDeps = {
  // Reads a profile's trophies, as whoever is signed in when it is called.
  load: (userId: string) => Promise<UserTrophies>
  savePins: (userId: string, pins: string[]) => Promise<unknown>
  // Who the API sees the page as right now: a user id, or ANON_VIEWER.
  getViewerId: () => string
  // Resolves once getViewerId can be trusted: on page load a signed-in
  // viewer looks anonymous until the session has been restored.
  whenViewerKnown: () => Promise<unknown>
  onSaveError: (message: string) => void
}

export const ANON_VIEWER = 'anon'
const MAX_IDLE = 20

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

export function createUserTrophiesStore(deps: UserTrophiesStoreDeps) {
  const entries = new Map<string, UserTrophiesEntry>()
  const listeners = new Map<string, Set<() => void>>()

  // An entry's key: the profile, and who is looking at it. Every function
  // that waits (a load, a save) keeps the key it started with, so it never
  // moves to another viewer's entry halfway.
  const keyOf = (userId: string, viewerId = deps.getViewerId()) =>
    `${viewerId}/${userId}`

  const getEntry = (key: string): UserTrophiesEntry =>
    entries.get(key) ?? {
      localClaims: [],
      claimsVersion: 0,
      replacedAtVersion: 0,
      pinsVersion: 0,
      pinsSaves: 0,
      savePending: false,
      lastUsed: Date.now(),
    }

  const setEntry = (key: string, patch: Partial<UserTrophiesEntry>) => {
    entries.set(key, { ...getEntry(key), ...patch })
    listeners.get(key)?.forEach((listener) => listener())
  }

  // `forPinRecovery`: called by the save loop after a failed save, to show the
  // server's pins even though the loop is still running.
  function load(userId: string, key: string, forPinRecovery = false) {
    const entry = getEntry(key)
    if (entry.loading && !forPinRecovery) return entry.loading
    const startClaimsVersion = entry.claimsVersion
    const startPinsVersion = entry.pinsVersion
    const startPinsSaves = entry.pinsSaves
    const loading = deps
      .load(userId)
      .then((response) => {
        // Older API instances can omit fields during deployment.
        const fresh: UserTrophies = {
          ...response,
          ranks: response.ranks ?? [],
          rankPeaks: response.rankPeaks ?? [],
          ranksComputedTime: response.ranksComputedTime ?? null,
          storedPeakNetWorth: response.storedPeakNetWorth ?? null,
          starter: response.starter ?? null,
          rewarded: response.rewarded ?? [],
        }
        const current = getEntry(key)
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
        setEntry(key, {
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
        setEntry(key, {
          error: e instanceof Error ? e : new Error(String(e)),
        })
      })
      .finally(() => {
        if (getEntry(key).loading === loading) {
          setEntry(key, { loading: undefined })
        }
        pruneIdle()
      })
    setEntry(key, { loading })
    return loading
  }

  function loadIfStale(userId: string, key: string, freshMs: number) {
    const { loadedAt } = getEntry(key)
    if (loadedAt === undefined || Date.now() - loadedAt >= freshMs) {
      void load(userId, key)
    }
  }

  async function refresh(userId: string) {
    await deps.whenViewerKnown()
    // A read already in flight may have taken its snapshot before rollover.
    await getEntry(keyOf(userId)).loading
    // Key the new read by whoever is signed in now: the viewer can change
    // during the wait, and the request goes out with the new credentials.
    return load(userId, keyOf(userId))
  }

  /** Adds claims returned by claim-trophy. */
  function addClaims(userId: string, claims: TrophyClaim[]) {
    const key = keyOf(userId)
    const entry = getEntry(key)
    const version = entry.claimsVersion + 1
    setEntry(key, {
      // With no data yet (the entry was forgotten while the claim was in
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

  /** Adds the paid milestones returned by claim-trophy. A paid prize is never
   * unpaid, so they merge. */
  function addRewards(
    userId: string,
    // Missing from a stage 1 API's response (mid-deploy).
    rewardedOrMissing: UserTrophies['rewarded'] | undefined
  ) {
    const key = keyOf(userId)
    const rewarded = rewardedOrMissing ?? []
    const entry = getEntry(key)
    if (!entry.data) {
      // The entry was forgotten while the claim was in flight.
      setEntry(key, {
        localRewarded: mergeRefs(entry.localRewarded ?? [], rewarded),
      })
      return
    }
    setEntry(key, {
      data: {
        ...entry.data,
        rewarded: mergeRefs(entry.data.rewarded, rewarded),
      },
    })
  }

  /** Replaces claims after an admin unclaim, which also removes the pin. */
  function replaceClaims(userId: string, claims: TrophyClaim[]) {
    const key = keyOf(userId)
    const entry = getEntry(key)
    if (!entry.data) return
    const version = entry.claimsVersion + 1
    setEntry(key, {
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
  function setPins(userId: string, pins: string[]) {
    const key = keyOf(userId)
    const entry = getEntry(key)
    if (!entry.data) return
    setEntry(key, {
      data: { ...entry.data, pins },
      pinsVersion: entry.pinsVersion + 1,
      savePending: true,
    })
    if (!entry.saving) savePinsUntilCurrent(userId, key)
  }

  const showConfirmedPins = (key: string) => {
    const entry = getEntry(key)
    if (!entry.data || entry.confirmedPins === undefined) return
    setEntry(key, {
      data: { ...entry.data, pins: entry.confirmedPins },
      pinsVersion: entry.pinsVersion + 1,
    })
  }

  function savePinsUntilCurrent(userId: string, key: string) {
    const saving = (async () => {
      while (getEntry(key).savePending) {
        setEntry(key, { savePending: false })
        // The signed-in account may have changed since the pins were chosen.
        // (Nobody signed in, e.g. before the session restores: send, and the
        // API decides.)
        const viewerId = deps.getViewerId()
        if (viewerId !== ANON_VIEWER && viewerId !== userId) {
          showConfirmedPins(key)
          break
        }
        const pins = getEntry(key).data?.pins ?? []
        try {
          await deps.savePins(userId, pins)
          setEntry(key, {
            confirmedPins: pins,
            pinsSaves: getEntry(key).pinsSaves + 1,
          })
        } catch (e) {
          setEntry(key, { pinsSaves: getEntry(key).pinsSaves + 1 })
          deps.onSaveError(e instanceof Error ? e.message : String(e))
          if (getEntry(key).savePending) continue // a newer choice saves next
          await getEntry(key).loading
          if (getEntry(key).savePending) continue
          await load(userId, key, true)
          // If the server couldn't be read either, show its last known pins.
          if (getEntry(key).error && !getEntry(key).savePending) {
            showConfirmedPins(key)
          }
        }
      }
    })().finally(() => {
      setEntry(key, { saving: undefined })
      pruneIdle()
    })
    setEntry(key, { saving })
  }

  // Forget the least recently shown entries beyond MAX_IDLE. One still
  // loading or saving is kept, so its result has somewhere to land.
  const pruneIdle = () => {
    const idle = [...entries.entries()]
      .filter(
        ([key, e]) =>
          !listeners.has(key) && !e.loading && !e.saving && !e.savePending
      )
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
    for (const [key] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE))) {
      entries.delete(key)
    }
  }

  function subscribe(key: string, listener: () => void) {
    let set = listeners.get(key)
    if (!set) {
      set = new Set()
      listeners.set(key, set)
    }
    set.add(listener)
    return () => {
      const current = listeners.get(key)
      current?.delete(listener)
      if (current && current.size === 0) {
        listeners.delete(key)
        const entry = entries.get(key)
        if (entry) entries.set(key, { ...entry, lastUsed: Date.now() })
        pruneIdle()
      }
    }
  }

  const getSnapshot = (key: string) => entries.get(key)

  return {
    keyOf,
    load,
    loadIfStale,
    refresh,
    addClaims,
    addRewards,
    replaceClaims,
    setPins,
    subscribe,
    getSnapshot,
  }
}
