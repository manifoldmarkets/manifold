import { APIError } from 'common/api/utils'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  ExpiryNoticeDelivery,
  publishExpiryNotice,
  writeTransitionExpiryNotice,
} from 'shared/membership-expiry-notice'
import {
  advanceGrants,
  broadcastGrantTransition,
  grantRetryOptions,
  notifyGrantTransition,
} from 'shared/membership-grants'
import { log } from 'shared/monitoring/log'
import type { SupabaseTransaction } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'

export function checkPriceCeiling(price: number, ceiling?: number) {
  if (ceiling !== undefined && price > ceiling)
    throw new APIError(
      409,
      `The price changed to M$${price.toLocaleString(
        'en-US'
      )}. Please check and confirm again.`
    )
}

export async function runShopCheckout<T>(
  userId: string,
  isMembershipPurchase: boolean,
  purchase: (tx: SupabaseTransaction, now: number) => Promise<T>,
  publisher: {
    broadcast: (result: T) => void
    notify?: (result: T) => Promise<unknown>
  },
  onAfterCommit?: (published: Promise<void>) => void
) {
  const settleCheckout = async (tx: SupabaseTransaction) => {
    const now = Date.now()
    const transition = await advanceGrants(tx, userId, now, {
      allowRowMismatch: !isMembershipPurchase,
      deferExpiryNotices: true,
    })
    let outcome: { result: T } | { error: APIError }
    try {
      outcome = { result: await tx.tx((savepoint) => purchase(savepoint, now)) }
    } catch (error) {
      // The savepoint discarded the purchase. Keep a grant change on refusal.
      if (
        !(error instanceof APIError) ||
        !(transition.started || transition.ended)
      )
        throw error
      outcome = { error }
    }
    const notices: NonNullable<ExpiryNoticeDelivery>[] = []
    for (const { row, grantId } of transition.deferredNotices ?? []) {
      const notice = await writeTransitionExpiryNotice(
        tx,
        userId,
        row,
        grantId,
        now
      )
      if (notice) notices.push(notice)
    }
    return { transition, outcome, notices }
  }

  const { transition, outcome, notices } =
    await betsQueue.enqueueFn(async () => {
      const committed = await runTransactionWithRetries(
        settleCheckout,
        3,
        grantRetryOptions
      )
      // Publish absolute state before another checkout can acquire this queue slot.
      broadcastGrantTransition(userId, committed.transition)
      if ('result' in committed.outcome) {
        try {
          publisher.broadcast(committed.outcome.result)
        } catch (error) {
          log.error('Failed to broadcast shop purchase', { userId, error })
        }
      }
      return committed
    }, [userId])

  const notifications: (() => Promise<unknown>)[] = [
    () => notifyGrantTransition(transition),
    ...notices.map((notice) => () => publishExpiryNotice(notice)),
  ]
  const { notify } = publisher
  if ('result' in outcome && notify)
    notifications.push(() => notify(outcome.result))
  const published = publishCheckoutNotifications(userId, notifications)
  onAfterCommit?.(published)
  if ('error' in outcome) throw outcome.error
  return outcome.result
}

async function publishCheckoutNotifications(
  userId: string,
  notifications: (() => Promise<unknown>)[]
) {
  for (const notify of notifications) {
    try {
      await notify()
    } catch (error) {
      log.error('Failed to publish shop checkout notification', {
        userId,
        error,
      })
    }
  }
}
