// Pairs old market-resolution notifications with the resolution that sent
// them, for backfill-resolution-notification-liquidity.ts. Until Nov 2026 a
// notification's userPayout counted what the user's liquidity paid back as if
// their trades had paid it. The user's payout txn for that resolution records
// that part as `deposit`.
//
// Only markets (or answers) resolved exactly once are fixed. A market
// resolved, unresolved and resolved again sends a notification for each
// resolution, and its history can't be rebuilt for certain from what's
// stored: a resolution that pays no one leaves no payouts, a notification can
// be written after the next resolution began, and old unresolves left no
// record. Those notifications are reported and left alone.

import { groupBy, keyBy } from 'lodash'

// One CONTRACT_RESOLUTION_PAYOUT txn. A resolution writes one per user paid,
// all with its transaction's start as created_time.
export type ResolutionPayout = {
  userId: string
  contractId: string
  answerId: string | null
  createdTime: number
  // created_time is at or after the start of the period asked for, compared
  // in the database
  inPeriod: boolean
  // The liquidity's share of the payout. Negative when cancelling a market
  // takes back liquidity the user had withdrawn.
  deposit: number
}

// The market's (or, with answerId, the answer's) resolution now
export type CurrentResolution = {
  contractId: string
  answerId: string | null
  resolution: string | null
  resolutionTime: number | null
}

export type ResolutionNotification = {
  userId: string
  notificationId: string
  contractId: string
  answerId: string | null
  createdTime: number
  outcome: string | null
  userPayout: number
  // Already has userLiquidityPayout
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
// The clocks differ: the API host's for the notification and resolution
// time, the database's for the txn.
export const CLOCK_SKEW_MS = 1000
// The resolution time is taken in the resolution's transaction, after it
// started.
export const MAX_RESOLUTION_TIME_LAG_MS = 60 * 1000

const marketKey = (p: { contractId: string; answerId: string | null }) =>
  `${p.contractId}|${p.answerId ?? ''}`

// payouts: every payout ever on the notifications' markets, to anyone.
// notifications: every resolution notification the users have on those
// markets, fixed or not. unresolvedContracts: markets with any undone payout,
// on any answer. A notification is fixed only when:
// - its market (or answer) has exactly one resolution's payouts,
// - no payout on the market was ever undone,
// - the market is still resolved, at that time, to the notification's outcome,
// - it's the user's only resolution notification on the market (or answer),
// - it was written within MAX_NOTIFICATION_DELAY_MS of the resolution,
// - the resolution is in the period asked for,
// - and the user's payout in it had a liquidity share.
export const getNotificationFixes = (
  notifications: ResolutionNotification[],
  payouts: ResolutionPayout[],
  currentResolutions: CurrentResolution[],
  unresolvedContracts: Set<string>
) => {
  const payoutsByMarket = groupBy(payouts, marketKey)
  const currentByMarket = keyBy(currentResolutions, marketKey)
  const notificationsByUserMarket = groupBy(
    notifications,
    (n) => `${n.userId}|${marketKey(n)}`
  )

  const fixes: NotificationFix[] = []
  const doubtful: DoubtfulNotification[] = []
  for (const n of notifications) {
    if (n.fixed) continue
    const market = marketKey(n)
    const marketPayouts = payoutsByMarket[market] ?? []
    const own = marketPayouts.filter((p) => p.userId === n.userId)
    // Nothing to move unless some resolution paid the user's liquidity
    if (!own.some((p) => Number.isFinite(p.deposit) && p.deposit !== 0))
      continue
    const leave = (reason: string) => doubtful.push({ notification: n, reason })

    const resolutionTimes = new Set(marketPayouts.map((p) => p.createdTime))
    if (resolutionTimes.size !== 1) {
      leave(`${resolutionTimes.size} resolutions' payouts on the market`)
      continue
    }
    const [time] = resolutionTimes
    if (unresolvedContracts.has(n.contractId)) {
      leave('a payout on the market was undone')
      continue
    }
    const current = currentByMarket[market]
    if (
      current?.resolutionTime == null ||
      current.resolutionTime < time - CLOCK_SKEW_MS ||
      current.resolutionTime > time + MAX_RESOLUTION_TIME_LAG_MS
    ) {
      leave("the market's resolution time isn't its payouts'")
      continue
    }
    if (current.resolution !== n.outcome) {
      leave(`resolved to ${current.resolution}, notified ${n.outcome}`)
      continue
    }
    if (notificationsByUserMarket[`${n.userId}|${market}`].length > 1) {
      leave('more than one resolution notification on the market')
      continue
    }
    if (
      n.createdTime < time - CLOCK_SKEW_MS ||
      n.createdTime - time > MAX_NOTIFICATION_DELAY_MS
    ) {
      leave(`written ${Math.round((n.createdTime - time) / 1000)} s after it`)
      continue
    }
    const [payout] = own
    if (!payout.inPeriod) continue
    const { deposit } = payout
    if (!Number.isFinite(n.userPayout)) continue
    const tradePayout = n.userPayout - deposit
    // A trade payout is negative only when a cancellation takes back sales.
    if (tradePayout < -1e-6 && n.outcome !== 'CANCEL') {
      leave(`userPayout ${n.userPayout} is below the liquidity's ${deposit}`)
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
