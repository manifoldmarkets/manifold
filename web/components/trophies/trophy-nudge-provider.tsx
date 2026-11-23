import Link from 'next/link'
import { createContext, ReactNode, useContext, useEffect } from 'react'
import toast from 'react-hot-toast'

import {
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

  useEffect(() => {
    if (!userId || !username) {
      lastObservedBet = undefined
      return
    }
    if (lastObservedBet?.userId !== userId) {
      lastObservedBet = { userId, time: lastBetTime }
      return
    }
    if (lastBetTime > lastObservedBet.time) {
      lastObservedBet = {
        userId,
        time: lastBetTime,
        reload: refreshUserTrophies(userId),
      }
    }
    // A route change or updated tier can remount this observer mid-request.
    const bet = lastObservedBet
    if (!bet.reload) return
    let active = true
    bet.reload.then(({ before, after }) => {
      if (!active) return
      bet.reload = undefined
      if (!before?.starter || !after?.starter) return
      const prior = getClaimableOnboardingMilestones(
        before.starter,
        before.claims
      )
      const ready = getClaimableOnboardingMilestones(
        after.starter,
        after.claims
      )
      for (const item of ready) {
        const { definition, milestone } = item
        const key = `${userId}/${definition.id}/${milestone.id}`
        if (prior.includes(item) || announced.has(key)) continue
        announced.add(key)
        const amount = getTrophyClaimReward(
          definition,
          milestone,
          after.rewarded,
          multiplier
        )
        toast((t) => (
          <Link
            href={`/${username}?tab=trophies`}
            onClick={() => toast.dismiss(t.id)}
            className="font-medium hover:underline"
          >
            {milestone.emoji} Trophy unlocked: {milestone.name} ·{' '}
            {amount > 0
              ? `claim ${formatTrophyReward(amount)}`
              : 'claim trophy'}
          </Link>
        ))
      }
    })
    return () => {
      active = false
    }
  }, [userId, username, lastBetTime, multiplier])

  const count = trophies
    ? getClaimableOnboardingMilestones(trophies.starter, trophies.claims).length
    : 0
  return (
    <TrophyCountContext.Provider value={count}>
      {props.children}
    </TrophyCountContext.Provider>
  )
}

const TrophyCountContext = createContext(0)
export const useNavTrophyCount = () => useContext(TrophyCountContext)

// Page remounts on navigation. Only an observed increase during this browser
// session can announce a milestone, once per account.
let lastObservedBet:
  | {
      userId: string
      time: number
      reload?: ReturnType<typeof refreshUserTrophies>
    }
  | undefined
const announced = new Set<string>()
