import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxnInBetQueue, type TxnData } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId, isModId } from 'common/envs/constants'

export const shopResetAll: APIHandler<'shop-reset-all'> = async (_, auth) => {
  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  // Only allow admins/mods to use this endpoint
  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'Admin access required')
  }

  const pg = createSupabaseDirectClient()

  const result = await pg.tx(async (tx) => {
    // Get all shop orders for this user to calculate refund amount
    const orders = await tx.manyOrNone<{ item_id: string; price_mana: number }>(
      `SELECT item_id, price_mana FROM shop_orders
       WHERE user_id = $1 AND status = 'COMPLETED'`,
      [auth.uid]
    )

    const totalRefund = orders.reduce((sum, o) => sum + o.price_mana, 0)

    if (totalRefund > 0) {
      // Create refund transaction
      const txnData: TxnData = {
        category: 'SHOP_REFUND',
        fromType: 'BANK',
        fromId: 'BANK',
        toType: 'USER',
        toId: auth.uid,
        amount: totalRefund,
        token: 'M$',
        description: 'Admin: Refund all shop purchases',
      }

      await runTxnInBetQueue(tx, txnData)
    }

    // Delete all entitlements
    await tx.none(`DELETE FROM user_entitlements WHERE user_id = $1`, [
      auth.uid,
    ])

    // Mark all orders as refunded
    await tx.none(
      `UPDATE shop_orders SET status = 'REFUNDED' WHERE user_id = $1`,
      [auth.uid]
    )

    // Reset streak forgiveness to 0
    await tx.none(
      `UPDATE users
       SET data = jsonb_set(
         COALESCE(data, '{}'),
         '{streakForgiveness}',
         '0'
       )
       WHERE id = $1`,
      [auth.uid]
    )

    return { success: true as const, refundedAmount: totalRefund }
  })

  return result
}
