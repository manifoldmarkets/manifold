import { useMemo } from 'react'

import {
  getClaimableMilestones,
  getTrophyDefinitionsFor,
  getTrophyDisplayStats,
} from 'common/trophies'
import { useUser } from './use-user'
import { useUserAchievements } from './use-user-achievements'
import { useUserTrophies } from './use-user-trophies'

/** The signed-in account's claimable milestones, shared by both count bubbles. */
export function useClaimableTrophies(freshMs?: number) {
  const account = useUser()
  const user = account?.isBot ? undefined : account
  const { trophies, loading: loadingTrophies } = useUserTrophies(
    user?.id,
    'if-stale',
    freshMs
  )
  const {
    achievements,
    loading: loadingAchievements,
    retry: refreshAchievements,
  } = useUserAchievements(user?.id, freshMs)
  const ready = useMemo(
    () =>
      trophies && (achievements || trophies.starter)
        ? getClaimableMilestones(
            getTrophyDisplayStats(achievements, trophies),
            trophies.claims,
            getTrophyDefinitionsFor(!!trophies.starter)
          )
        : [],
    [achievements, trophies]
  )
  return {
    user,
    achievements,
    trophies,
    ready,
    loading: loadingAchievements || loadingTrophies,
    refreshAchievements,
  }
}
