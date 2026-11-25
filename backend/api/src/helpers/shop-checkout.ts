import { betsQueue } from 'shared/helpers/fn-queue'
import {
  publishExpiryNotice,
  writeTransitionExpiryNotice,
} from 'shared/membership-expiry-notice'
import {
  advanceGrants,
  grantRetryOptions,
  publishGrantTransition,
} from 'shared/membership-grants'
import { log } from 'shared/monitoring/log'
import type { SupabaseTransaction } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'

export async function runShopCheckout<T>(
  userId: string,
  isMembershipPurchase: boolean,
  purchase: (tx: SupabaseTransaction, now: number) => Promise<T>,
  publishPurchase: (result: T) => void | Promise<unknown>,
  onAfterCommit?: (published: Promise<void>) => void
) {
  const afterCommit: (() => void | Promise<unknown>)[] = []
  try {
    const result = await betsQueue.enqueueFn(async () => {
      while (true) {
        const attempt = await runTransactionWithRetries(
          async (tx) => {
            const now = Date.now()
            const transition = await advanceGrants(tx, userId, now, {
              allowRowMismatch: !isMembershipPurchase,
              deferExpiryNotices: true,
            })
            // Commit a start or restoration even if the purchase is later refused.
            if (transition.started || transition.ended) return { transition }
            return { purchase: await purchase(tx, now) }
          },
          3,
          grantRetryOptions
        )
        const { transition } = attempt
        if (!transition) return attempt.purchase
        afterCommit.push(() => publishGrantTransition(userId, transition))
        for (const { row, grantId } of transition.deferredNotices ?? []) {
          afterCommit.push(async () => {
            const notice = await runTransactionWithRetries((tx) =>
              writeTransitionExpiryNotice(tx, userId, row, grantId, Date.now())
            )
            await publishExpiryNotice(notice)
          })
        }
      }
    }, [userId])
    afterCommit.push(() => publishPurchase(result))
    return result
  } finally {
    // A declined purchase can still have committed grant transitions.
    const published = publishCheckoutUpdates(userId, afterCommit)
    onAfterCommit?.(published)
  }
}

async function publishCheckoutUpdates(
  userId: string,
  afterCommit: (() => void | Promise<unknown>)[]
) {
  for (const publish of afterCommit) {
    try {
      await publish()
    } catch (error) {
      log.error('Failed to publish shop checkout update', { userId, error })
    }
  }
}
