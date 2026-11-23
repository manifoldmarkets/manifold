import Link from 'next/link'
import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'

import {
  ONBOARDING_MILESTONES,
  TrophyClaim,
  getClaimableOnboardingMilestones,
  getTrophyClaimReward,
  isStarterTrophyAccount,
} from 'common/trophies'
import { useTrophyRewardMultiplier } from 'web/hooks/use-trophy-reward-multiplier'
import { useUser } from 'web/hooks/use-user'
import {
  refreshUserTrophies,
  useUserTrophies,
} from 'web/hooks/use-user-trophies'
import { formatTrophyReward } from './trophy-reward-chip'

export function TrophyNudgeProvider(props: { children: ReactNode }) {
  const user = useUser()
  const userId =
    user && isStarterTrophyAccount(user.createdTime) ? user.id : undefined
  const { trophies } = useUserTrophies(userId, 'if-stale')
  const multiplier = useTrophyRewardMultiplier()
  const username = user?.username
  const lastBetTime = user?.lastBetTime ?? 0
  const ready = useMemo(
    () =>
      trophies
        ? getClaimableOnboardingMilestones(trophies.starter, trophies.claims)
        : [],
    [trophies]
  )

  useEffect(() => {
    if (!userId || !username) {
      session = undefined
      return
    }
    if (session?.userId !== userId) {
      session = { userId, lastBetTime, seen: new Set(), initialized: false }
    } else if (lastBetTime > session.lastBetTime) {
      session.lastBetTime = lastBetTime
      if (!trophies || !hasClaimedAllOnboarding(trophies.claims)) {
        void refreshUserTrophies(userId)
      }
    }
    // A maker's limit-order fill can first appear on focus or a stale navigation.
    if (!trophies) return
    for (const { definition, milestone } of ready) {
      const key = `${definition.id}/${milestone.id}`
      if (session.seen.has(key)) continue
      session.seen.add(key)
      if (!session.initialized || !recordToast(userId, key)) continue
      const amount = getTrophyClaimReward(
        definition,
        milestone,
        trophies.rewarded,
        multiplier
      )
      toast((t) => (
        <Link
          href={`/${username}?tab=trophies`}
          onClick={() => toast.dismiss(t.id)}
          className="font-medium hover:underline"
        >
          {milestone.emoji} Trophy unlocked: {milestone.name} ·{' '}
          {amount > 0 ? `claim ${formatTrophyReward(amount)}` : 'claim trophy'}
        </Link>
      ))
    }
    session.initialized = true
  }, [userId, username, lastBetTime, trophies, ready, multiplier])

  return (
    <TrophyCountContext.Provider value={ready.length}>
      {props.children}
    </TrophyCountContext.Provider>
  )
}

const TrophyCountContext = createContext(0)
export const useNavTrophyCount = () => useContext(TrophyCountContext)

// The provider remounts on navigation. Keep the account's first read silent
// and remember each claimable milestone even after a claim or admin unclaim.
let session:
  | {
      userId: string
      lastBetTime: number
      seen: Set<string>
      initialized: boolean
    }
  | undefined

const hasClaimedAllOnboarding = (claims: TrophyClaim[]) =>
  ONBOARDING_MILESTONES.every(({ definition, milestone }) =>
    claims.some(
      (c) => c.trophyId === definition.id && c.milestoneId === milestone.id
    )
  )

function recordToast(userId: string, key: string) {
  try {
    const storageKey = `trophy-toasts-${userId}`
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    const keys = Array.isArray(stored) ? stored : []
    if (keys.includes(key)) return false
    localStorage.setItem(storageKey, JSON.stringify([...keys, key]))
  } catch {
    // If storage is unavailable, the session's seen set still deduplicates.
  }
  return true
}
