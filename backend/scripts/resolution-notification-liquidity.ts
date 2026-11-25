// Pairs old market-resolution notifications with the payout that sent them,
// for backfill-resolution-notification-liquidity.ts. Until Nov 2026 a
// notification's userPayout counted what the user's liquidity paid back as if
// their trades had paid it. The payout txn records that part as `deposit`.

import { groupBy, maxBy } from 'lodash'

// One CONTRACT_RESOLUTION_PAYOUT txn: one per user per resolution.
export type ResolutionPayout = {
  userId: string
  contractId: string
  answerId: string | null
  createdTime: number
  // The liquidity's share of the payout
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
}

export type NotificationFix = {
  userId: string
  notificationId: string
  oldUserPayout: number
  userPayout: number
  userLiquidityPayout: number
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
// nothing would be mistaken for the earlier one.
export const getNotificationFixes = (
  notifications: ResolutionNotification[],
  payouts: ResolutionPayout[]
) => {
  const payoutsByKey = groupBy(payouts, key)
  const fixes: NotificationFix[] = []
  // Pairs where the stored payout is below the liquidity's share: a trade
  // payout can't be negative unless the market was cancelled, so the pairing
  // is doubtful. Left alone and reported.
  const doubtful: { notification: ResolutionNotification; deposit: number }[] =
    []
  for (const n of notifications) {
    const payout = maxBy(
      (payoutsByKey[key(n)] ?? []).filter(
        (p) => p.createdTime <= n.createdTime + CLOCK_SKEW_MS
      ),
      (p) => p.createdTime
    )
    if (!payout) continue
    if (n.createdTime - payout.createdTime > MAX_NOTIFICATION_DELAY_MS) continue
    const { deposit } = payout
    if (!Number.isFinite(deposit) || deposit <= 0) continue
    if (!Number.isFinite(n.userPayout)) continue
    const tradePayout = n.userPayout - deposit
    if (tradePayout < -1e-6 && n.outcome !== 'CANCEL') {
      doubtful.push({ notification: n, deposit })
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
