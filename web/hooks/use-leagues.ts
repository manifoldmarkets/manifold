import { useEffect, useSyncExternalStore } from 'react'

import { league_user_info } from 'common/leagues'
import {
  getLeagueChats,
  getLeagueInfo,
  getOwnedLeagueChats,
} from 'web/lib/supabase/leagues'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { usePersistentLocalState } from './use-persistent-local-state'
import { api } from 'web/lib/api/api'

// The current season, shared by every useLeagueInfo. Its own store, not
// useAPIGetter('get-season-info'), whose data is shared with requests for
// past seasons (the earnings breakdown). Read on first use, on focus once
// SEASON_FRESH_MS old, and every SEASON_FRESH_MS while the page is visible,
// so an open tab moves to a new season.
const SEASON_FRESH_MS = 5 * 60_000
const seasonListeners = new Set<() => void>()
let currentSeason: number | undefined
let seasonLoadedAt: number | undefined
let loadingSeason = false
let seasonInterval: number

const getSeasonSnapshot = () => currentSeason

async function loadSeason() {
  if (loadingSeason) return
  loadingSeason = true
  try {
    const { season } = await api('get-season-info', {})
    currentSeason = season
    seasonLoadedAt = Date.now()
    seasonListeners.forEach((notify) => notify())
  } catch {
    // Keep the last season until a refresh succeeds.
  } finally {
    loadingSeason = false
  }
}

const seasonIsStale = () =>
  seasonLoadedAt === undefined || Date.now() - seasonLoadedAt >= SEASON_FRESH_MS

const refreshVisibleSeason = () => {
  if (document.visibilityState === 'visible') loadSeason()
}

const onSeasonFocus = () => {
  if (seasonIsStale()) refreshVisibleSeason()
}

function subscribeToSeason(notify: () => void) {
  seasonListeners.add(notify)
  if (seasonListeners.size === 1) {
    window.addEventListener('focus', onSeasonFocus)
    document.addEventListener('visibilitychange', onSeasonFocus)
    seasonInterval = window.setInterval(refreshVisibleSeason, SEASON_FRESH_MS)
  }
  if (seasonIsStale()) loadSeason()

  return () => {
    seasonListeners.delete(notify)
    if (seasonListeners.size === 0) {
      window.removeEventListener('focus', onSeasonFocus)
      document.removeEventListener('visibilitychange', onSeasonFocus)
      window.clearInterval(seasonInterval)
    }
  }
}

export const useCurrentSeason = () =>
  useSyncExternalStore(subscribeToSeason, getSeasonSnapshot, () => undefined)

// The user's league this season: undefined until known, null for none. The
// stored result names its season, so a row from an earlier season is never
// shown as this season's, even when this season's lookup fails.
export const useLeagueInfo = (userId: string | null | undefined) => {
  const [stored, setStored] = usePersistentLocalState<
    { season: number; info: league_user_info | null } | undefined
  >(undefined, `league-info-by-season-${userId}`)
  const season = useCurrentSeason()

  useEffect(() => {
    if (!userId || season === undefined) return
    let active = true
    getLeagueInfo(userId, season)
      .then((result) => {
        if (active)
          setStored({ season, info: result as league_user_info | null })
      })
      .catch(() => {
        // Keep the last known row for this season if the lookup fails.
      })
    return () => {
      active = false
    }
  }, [userId, season, setStored])

  return stored && season !== undefined && stored.season === season
    ? stored.info
    : undefined
}

export const useLeagueChats = (season: number) => {
  const [leagueChats, setLeagueChats] = usePersistentInMemoryState<any[]>(
    [],
    `league-chats-${season}`
  )

  useEffect(() => {
    getLeagueChats(season).then((result) => {
      setLeagueChats(result)
    })
  }, [season])

  return leagueChats
}
export const useOwnedLeagueChats = (
  season: number,
  userId: string | undefined
) => {
  const [leagueChats, setLeagueChats] = usePersistentInMemoryState<any[]>(
    [],
    `owned-league-chats-${season}`
  )

  useEffect(() => {
    if (!userId) return
    getOwnedLeagueChats(season, userId).then((result) => {
      setLeagueChats(result)
    })
  }, [season, userId])

  return leagueChats
}
