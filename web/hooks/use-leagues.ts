import { useEffect } from 'react'

import { league_user_info } from 'common/leagues'
import {
  getLeagueChats,
  getLeagueInfo,
  getOwnedLeagueChats,
} from 'web/lib/supabase/leagues'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { usePersistentLocalState } from './use-persistent-local-state'
import { useAPIGetter } from './use-api-getter'

// The user's league this season: undefined until known, null for none. The
// stored result names its season, so a row from an earlier season is never
// shown as this season's, even when this season's lookup fails.
export const useLeagueInfo = (userId: string | null | undefined) => {
  const [stored, setStored] = usePersistentLocalState<
    { season: number; info: league_user_info | null } | undefined
  >(undefined, `league-info-by-season-${userId}`)
  const { data: seasonInfo } = useAPIGetter('get-season-info', {})
  const season = seasonInfo?.season

  useEffect(() => {
    if (userId && season) {
      getLeagueInfo(userId, season)
        .then((result) => {
          setStored({ season, info: result as league_user_info | null })
        })
        .catch(() => {
          // Keep the last known value: a failed lookup isn't "no league" (the
          // profile showcase would otherwise drop a saved league pin).
        })
    }
  }, [userId, season])

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
