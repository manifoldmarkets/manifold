import { APIError, type APIHandler } from './helpers/endpoint'
import { isAdminId } from 'common/envs/constants'
import { runTxnOutsideBetQueue, type TxnData } from 'shared/txn/run-txn'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { betsQueue } from 'shared/helpers/fn-queue'
import { PRINTFUL_API_URL, getShopItem } from 'common/shop/items'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Notification } from 'common/notification'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'
import { nanoid } from 'common/util/random'

export const cancelMerchOrder: APIHandler<'cancel-merch-order'> = async (
  { orderId },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can cancel merch orders')
  }

  // All checks + refund happen inside one transaction to prevent double-refund race.
  // We lock the order row with FOR UPDATE so concurrent cancel requests serialize.
  const { refundAmount, printfulOrderId, userId, itemId: orderItemId } = await betsQueue.enqueueFn(
    () =>
      runTransactionWithRetries(async (tx) => {
        const order = await tx.oneOrNone(
          `SELECT * FROM shop_orders
           WHERE id = $1 AND item_id LIKE 'merch-%'
           FOR UPDATE`,
          [orderId]
        )

        if (!order) {
          throw new APIError(404, 'Merch order not found')
        }

        if (order.status === 'CANCELLED' || order.status === 'REFUNDED' || order.status === 'FAILED') {
          throw new APIError(400, 'Order is already cancelled/refunded')
        }

        if (order.status === 'DELIVERED') {
          throw new APIError(400, 'Cannot cancel a delivered order')
        }

        const amount = Number(order.price_mana)
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new APIError(500, 'Invalid order price — cannot refund')
        }

        const refundTxn: TxnData = {
          category: 'SHOP_PURCHASE',
          fromType: 'BANK',
          fromId: 'BANK',
          toType: 'USER',
          toId: order.user_id,
          amount,
          token: 'M$',
          description: `Admin refund: merch order ${orderId} cancelled`,
          data: {
            itemId: order.item_id,
            merchOrder: true,
            refund: true,
            cancelledBy: auth.uid,
          },
        }

        await runTxnOutsideBetQueue(tx, refundTxn)
        await tx.none(
          `UPDATE shop_orders SET status = 'CANCELLED' WHERE id = $1`,
          [orderId]
        )

        return {
          refundAmount: amount,
          printfulOrderId: (order.printful_order_id as string) ?? null,
          userId: order.user_id as string,
          itemId: order.item_id as string,
        }
      }),
    [orderId]
  )

  // Best-effort Printful cancellation after the DB transaction commits.
  // If this fails, the mana refund still stands — admin can cancel manually in Printful.
  if (printfulOrderId) {
    const printfulToken = process.env.PRINTFUL_API_TOKEN
    if (printfulToken) {
      try {
        const res = await fetch(
          `${PRINTFUL_API_URL}/orders/${printfulOrderId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${printfulToken}` },
          }
        )
        if (!res.ok) {
          console.warn(
            `Printful cancel failed for order ${printfulOrderId}:`,
            res.status,
            await res.text().catch(() => '')
          )
        }
      } catch (e: unknown) {
        console.warn(`Printful cancel request failed for ${printfulOrderId}:`, e)
      }
    }
  }

  // Notify the user their order was cancelled and refunded
  try {
    const pg = createSupabaseDirectClient()
    const item = getShopItem(orderItemId)
    const itemName = item?.name ?? orderItemId
    const notification: Notification = {
      id: nanoid(6),
      userId,
      reason: 'merch_order_update',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: orderId,
      sourceType: 'merch_order_update',
      sourceUserName: MANIFOLD_USER_NAME,
      sourceUserUsername: MANIFOLD_USER_USERNAME,
      sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
      sourceText: `Your ${itemName} order has been cancelled and refunded.`,
      data: { itemId: orderItemId, itemName, event: 'cancelled', refundAmount },
    }
    await insertNotificationToSupabase(notification, pg)
  } catch (e: unknown) {
    console.warn('Merch cancel notification failed:', e)
  }

  return { success: true, refundedAmount: refundAmount }
}
