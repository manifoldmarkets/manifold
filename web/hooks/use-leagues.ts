import { useEffect } from 'react'

import { league_user_info } from 'common/leagues'
import { getLeagueInfo } from 'web/lib/supabase/leagues'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const useLeagueInfo = (userId: string | null | undefined) => {
  const [leagueInfo, setLeagueInfo] = usePersistentInMemoryState<
    league_user_info | undefined
  >(undefined, `league-info-${userId}`)

  useEffect(() => {
    if (userId) {
      getLeagueInfo(userId).then((result) => {
        if (result === null)
          throw new Error('No league info found for user ' + userId)

        setLeagueInfo(result as league_user_info)
      })
    }
  }, [userId])

  return leagueInfo
}
