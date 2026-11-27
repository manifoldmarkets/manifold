import Link from 'next/link'
import { createContext, ReactNode, useContext, useEffect } from 'react'
import toast from 'react-hot-toast'

import { getTrophyClaimPrize, selectTrophyUnlockToasts } from 'common/trophies'
import { useClaimableTrophies } from 'web/hooks/use-claimable-trophies'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useTrophyPrizeAccount } from 'web/hooks/use-trophy-prize-account'
import { refreshUserTrophies } from 'web/hooks/use-user-trophies'
import { formatPrizeText } from './trophy-prize-chip'

const NAV_FRESH_MS = 5 * 60_000
const BET_REFRESH_MS = 30_000

export function TrophyNudgeProvider(props: { children: ReactNode }) {
  const { user, achievements, trophies, ready, loading, refreshAchievements } =
    useClaimableTrophies(NAV_FRESH_MS)
  const userId = user?.id
  const username = user?.username
  const lastBetTime = user?.lastBetTime ?? 0
  const hasStarterStats = !!trophies?.starter
  const prizeAccount = useTrophyPrizeAccount()
  const visible = useIsPageVisible()

  useEffect(() => {
    if (!userId) {
      session = undefined
      return
    }
    if (session?.userId !== userId) {
      session = { userId, lastBetTime, nextRefreshAt: 0 }
      return
    }
    const current = session
    // An in-flight read can predate this bet. Wait for it to settle before
    // taking a new snapshot, including when starter eligibility is still loading.
    if (lastBetTime <= current.lastBetTime || loading) return
    const refresh = () => {
      current.lastBetTime = lastBetTime
      current.nextRefreshAt = Date.now() + BET_REFRESH_MS
      refreshAchievements()
      if (hasStarterStats) void refreshUserTrophies(userId)
    }
    const delay = current.nextRefreshAt - Date.now()
    if (delay <= 0) {
      refresh()
      return
    }
    // Only advance lastBetTime when the refresh runs, so a newer bet or a
    // navigation can reschedule the trailing read at the same deadline.
    const timer = setTimeout(refresh, delay)
    return () => clearTimeout(timer)
  }, [userId, lastBetTime, loading, refreshAchievements, hasStarterStats])

  useEffect(() => {
    if (
      !userId ||
      !username ||
      !trophies ||
      !achievements ||
      session?.userId !== userId
    )
      return
    const seen = session.seen ?? new Set<string>()
    for (const { trophyId, milestoneId } of trophies.claims) {
      seen.add(`${trophyId}/${milestoneId}`)
    }
    if (!session.seen) {
      // Both stores have loaded. Historical unlocks only establish the baseline.
      for (const { definition, milestone } of ready) {
        seen.add(`${definition.id}/${milestone.id}`)
      }
      session.seen = seen
      return
    }
    if (!visible || document.visibilityState !== 'visible') return

    const storageKey = `trophy-toasts-${userId}`
    const stored = readToastKeys(storageKey)
    for (const key of stored) seen.add(key)
    const { milestones, moreCount, newKeys } = selectTrophyUnlockToasts(
      ready,
      seen
    )
    if (!newKeys.length) return
    for (const key of newKeys) seen.add(key)
    try {
      localStorage.setItem(storageKey, JSON.stringify([...stored, ...newKeys]))
    } catch {
      // The session still remembers these milestones if storage is unavailable.
    }

    const showToast = (message: string) =>
      toast((t) => (
        <Link
          href={`/${username}?tab=trophies`}
          onClick={() => toast.dismiss(t.id)}
          className="font-medium hover:underline"
        >
          {message}
        </Link>
      ))
    for (const { definition, milestone } of milestones) {
      const prize = prizeAccount
        ? formatPrizeText(
            getTrophyClaimPrize(
              definition,
              milestone,
              trophies.rewarded,
              prizeAccount
            )
          )
        : []
      const claim = prize.length ? `claim ${prize.join(' + ')}` : 'claim trophy'
      showToast(
        `${milestone.emoji} Trophy unlocked: ${milestone.name} · ${claim}`
      )
    }
    if (moreCount) {
      showToast(
        `${moreCount} more ${
          moreCount === 1 ? 'trophy' : 'trophies'
        } ready to claim`
      )
    }
  }, [userId, username, trophies, achievements, ready, prizeAccount, visible])

  return (
    <TrophyCountContext.Provider value={ready.length}>
      {props.children}
    </TrophyCountContext.Provider>
  )
}

const TrophyCountContext = createContext(0)
export const useNavTrophyCount = () => useContext(TrophyCountContext)

// Page remounts on navigation. Keep the toast baseline and bet refresh window
// for the current account across those remounts.
let session:
  | {
      userId: string
      lastBetTime: number
      nextRefreshAt: number
      seen?: Set<string>
    }
  | undefined

function readToastKeys(storageKey: string): string[] {
  try {
    const keys: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (Array.isArray(keys))
      return keys.filter((key) => typeof key === 'string')
  } catch {
    // Use the session's seen set when the stored list cannot be read.
  }
  return []
}
