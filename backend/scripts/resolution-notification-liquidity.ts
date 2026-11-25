// Pairs old market-resolution notifications with the resolution that sent
// them, for backfill-resolution-notification-liquidity.ts. Until Nov 2026 a
// notification's userPayout counted what the user's liquidity paid back as if
// their trades had paid it. The user's payout txn for that resolution records
// that part as `deposit`.

import { groupBy, keyBy, maxBy } from 'lodash'

// One CONTRACT_RESOLUTION_PAYOUT txn. A resolution writes one per user paid,
// all with its transaction's start as created_time.
export type ResolutionPayout = {
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
// A notification is only paired when its market (or answer) had no other
// resolution in this long before it.
export const ISOLATION_MS = 60 * 60 * 1000

const marketKey = (p: { contractId: string; answerId: string | null }) =>
  `${p.contractId}|${p.answerId ?? ''}`
const payoutKey = (userId: string, market: string, time: number) =>
  `${userId}|${market}|${time}`

// payouts: every payout on the notifications' markets, to anyone, from
// ISOLATION_MS before the earliest notification. They give each market's
// resolution times (a resolution that paid no one leaves no trace, and isn't
// seen).
//
// A market resolved, unresolved and resolved again in quick succession sends
// a notification for each resolution, and timing alone can't always tell
// which is which: a notification can be written after the next resolution
// started, and a resolution may pay the user nothing. So a notification is
// only paired when exactly one resolution of its market came in the hour
// before it, within MAX_NOTIFICATION_DELAY_MS. Otherwise, if any of those
// resolutions paid the user's liquidity, it's reported and left alone.
export const getNotificationFixes = (
  notifications: ResolutionNotification[],
  payouts: ResolutionPayout[]
) => {
  const resolutionTimes = mapUniqueTimes(payouts)
  const payoutByKey = keyBy(payouts, (p) =>
    payoutKey(p.userId, marketKey(p), p.createdTime)
  )

  const fixes: NotificationFix[] = []
  const doubtful: DoubtfulNotification[] = []
  for (const n of notifications) {
    const market = marketKey(n)
    const candidates = (resolutionTimes[market] ?? []).filter(
      (t) =>
        t <= n.createdTime + CLOCK_SKEW_MS && n.createdTime - t <= ISOLATION_MS
    )
    const deposits = candidates.map(
      (t) => payoutByKey[payoutKey(n.userId, market, t)]?.deposit ?? 0
    )
    if (!deposits.some((d) => Number.isFinite(d) && d !== 0)) continue
    const latest = maxBy(candidates, (t) => t) ?? 0
    if (candidates.length > 1) {
      doubtful.push({
        notification: n,
        reason: `${candidates.length} resolutions of the market in the hour before it`,
      })
      continue
    }
    if (n.createdTime - latest > MAX_NOTIFICATION_DELAY_MS) {
      doubtful.push({
        notification: n,
        reason: `written ${Math.round(
          (n.createdTime - latest) / 1000
        )} s after the resolution`,
      })
      continue
    }
    const [deposit] = deposits
    if (!Number.isFinite(n.userPayout)) continue
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

const mapUniqueTimes = (payouts: ResolutionPayout[]) => {
  const byMarket = groupBy(payouts, marketKey)
  const times: { [market: string]: number[] } = {}
  for (const [market, ps] of Object.entries(byMarket)) {
    times[market] = Array.from(new Set(ps.map((p) => p.createdTime)))
  }
  return times
}
