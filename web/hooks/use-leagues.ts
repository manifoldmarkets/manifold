import { useEffect } from 'react'

import { league_user_info } from 'common/leagues'
import { getLeagueInfo } from 'web/lib/supabase/leagues'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const useLeagueInfo = (userId: string | null | undefined) => {
  const [leagueInfo, setLeagueInfo] = usePersistentInMemoryState<
    league_user_info | null | undefined
  >(undefined, `league-info-${userId}`)

  useEffect(() => {
    if (userId) {
      getLeagueInfo(userId).then((result) => {
        setLeagueInfo(result as league_user_info | null)
      })
    }
  }, [userId])

  return leagueInfo
}
