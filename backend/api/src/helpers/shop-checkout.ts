import { betsQueue } from 'shared/helpers/fn-queue'
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
  publishPurchase: (result: T) => void | Promise<unknown>
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
      }
    }, [userId])
    afterCommit.push(() => publishPurchase(result))
    return result
  } finally {
    // Dispatch committed updates in order, including on a declined checkout.
    // A slow push must neither hold the queue nor delay the final balance update.
    await Promise.all(
      afterCommit.map(async (publish) => {
        try {
          await publish()
        } catch (error) {
          log.error('Failed to publish shop checkout update', { userId, error })
        }
      })
    )
  }
}
