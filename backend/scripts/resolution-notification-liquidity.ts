// Pairs old market-resolution notifications with the payout that sent them,
// for backfill-resolution-notification-liquidity.ts. Until Nov 2026 a
// notification's userPayout counted what the user's liquidity paid back as if
// their trades had paid it. The payout txn records that part as `deposit`.

import { groupBy, maxBy } from 'lodash'

// One CONTRACT_RESOLUTION_PAYOUT txn: one per user per resolution.
export type ResolutionPayout = {
  id: string
  userId: string
  contractId: string
  answerId: string | null
  createdTime: number
  // The liquidity's share of the payout. Negative when cancelling a market
  // takes back liquidity the user had withdrawn.
  deposit: number
}

export type ResolutionNotification = {
  userId: string
  notificationId: string
  contractId: string
  answerId: string | null
  createdTime: number
  outcome: string | null
  userPayout: number
  // Already has userLiquidityPayout: not changed again, but still the
  // notification of its own resolution.
  fixed: boolean
}

export type NotificationFix = {
  userId: string
  notificationId: string
  oldUserPayout: number
  userPayout: number
  userLiquidityPayout: number
}

export type DoubtfulNotification = {
  notification: ResolutionNotification
  reason: string
}

// The notification is written after the resolution's transaction commits, and
// the txn's created_time is when that transaction started.
export const MAX_NOTIFICATION_DELAY_MS = 10 * 60 * 1000
// The two clocks differ: the API host's for the notification, the database's
// for the txn.
export const CLOCK_SKEW_MS = 1000

const key = (p: {
  userId: string
  contractId: string
  answerId: string | null
}) => `${p.userId}|${p.contractId}|${p.answerId ?? ''}`

// Each notification belongs to the user's latest payout on that market (and
// answer) before it: a market resolved, unresolved and resolved again has a
// payout and a notification for each resolution. Payouts must include those
// with no deposit, or a later resolution that paid the user's liquidity
// nothing would be mistaken for the earlier one. Notifications must include
// those already fixed, as they account for their own payouts.
//
// Timing alone can't place a notification that was written after the next
// resolution's payout, so a pairing is only trusted when it's one to one: no
// other notification takes the same payout, and every earlier payout in the
// notification's window has a notification of its own. Anything else is
// reported and left alone.
export const getNotificationFixes = (
  notifications: ResolutionNotification[],
  payouts: ResolutionPayout[]
) => {
  const payoutsByKey = groupBy(payouts, key)
  const pairs = notifications.map((n) => {
    const window = (payoutsByKey[key(n)] ?? []).filter(
      (p) =>
        p.createdTime <= n.createdTime + CLOCK_SKEW_MS &&
        n.createdTime - p.createdTime <= MAX_NOTIFICATION_DELAY_MS
    )
    return { n, window, payout: maxBy(window, (p) => p.createdTime) }
  })
  const claims = groupBy(
    pairs.filter((p) => p.payout),
    (p) => p.payout?.id
  )

  const fixes: NotificationFix[] = []
  const doubtful: DoubtfulNotification[] = []
  for (const { n, window, payout } of pairs) {
    if (!payout || n.fixed) continue
    const { deposit } = payout
    if (!Number.isFinite(deposit) || deposit === 0) continue
    if (!Number.isFinite(n.userPayout)) continue
    if (claims[payout.id].length > 1) {
      doubtful.push({
        notification: n,
        reason: `shares payout ${payout.id} with another notification`,
      })
      continue
    }
    const unclaimed = window.find((p) => p !== payout && !claims[p.id])
    if (unclaimed) {
      doubtful.push({
        notification: n,
        reason: `earlier payout ${unclaimed.id} has no notification`,
      })
      continue
    }
    const tradePayout = n.userPayout - deposit
    // A trade payout is negative only when a cancellation takes back sales.
    if (tradePayout < -1e-6 && n.outcome !== 'CANCEL') {
      doubtful.push({
        notification: n,
        reason: `userPayout ${n.userPayout} is below the liquidity's ${deposit}`,
      })
      continue
    }
    fixes.push({
      userId: n.userId,
      notificationId: n.notificationId,
      oldUserPayout: n.userPayout,
      userPayout: Math.abs(tradePayout) < 1e-9 ? 0 : tradePayout,
      userLiquidityPayout: deposit,
    })
  }
  return { fixes, doubtful }
}
