import { Request, Response } from 'express'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnOutsideBetQueue, type TxnData } from 'shared/txn/run-txn'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { betsQueue } from 'shared/helpers/fn-queue'
import { getShopItem } from 'common/shop/items'
import { Notification } from 'common/notification'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'
import { nanoid } from 'common/util/random'
import { formatMoney } from 'common/util/format'

// Printful webhook event types we care about
// See: https://developers.printful.com/docs/#tag/Webhook-API
type PrintfulEvent = {
  type: string
  data: {
    order: {
      id: number
      external_id?: string
      status: string
    }
    shipment?: {
      carrier: string
      service: string
      tracking_number: string
      tracking_url: string
      ship_date: string
    }
  }
}

// Map Printful event types to our shop_orders statuses. Note: Printful uses
// US spelling for events (`order_canceled`) while our DB enum has historically
// stored UK spelling (`'CANCELLED'`) — kept as-is to match existing data and
// every other status check in the codebase (ticket flows, etc.).
const STATUS_MAP: Record<string, string> = {
  package_shipped: 'SHIPPED',
  order_canceled: 'CANCELLED',
  order_failed: 'FAILED',
  package_returned: 'FAILED',
}

// Events that should trigger an automatic mana refund. Includes
// `order_canceled` so a Printful-side cancellation refunds the user
// without admin intervention. Admin-initiated cancels (via /admin/merch)
// already refund inside the cancel handler and set status to CANCELLED;
// when Printful bounces the resulting `order_canceled` webhook back at us,
// `refundOrder`'s status guard short-circuits it (no double refund).
const REFUND_EVENTS = new Set(['order_failed', 'order_canceled'])

// Events that need manual admin attention (log loud warning)
const MANUAL_REVIEW_EVENTS = new Set(['package_returned'])

export const printfulWebhook = async (req: Request, res: Response) => {
  // Verify the webhook secret token (configured in Printful dashboard as a query param)
  const token = req.query.token
  const expectedToken = process.env.PRINTFUL_WEBHOOK_SECRET
  if (!expectedToken || token !== expectedToken) {
    console.warn('Printful webhook: invalid or missing token')
    res.status(401).send('Unauthorized')
    return
  }

  let event: PrintfulEvent
  try {
    event =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    res.status(400).send('Invalid JSON')
    return
  }

  const printfulOrderId = String(event.data?.order?.id)
  if (!printfulOrderId || printfulOrderId === 'undefined') {
    res.status(400).send('Missing order ID')
    return
  }

  const newStatus = STATUS_MAP[event.type]
  if (!newStatus) {
    // Event type we don't handle (e.g. order_created, order_updated) — acknowledge it
    res.status(200).send('OK')
    return
  }

  const pg = createSupabaseDirectClient()

  // For refund-eligible events, skip the naive status UPDATE here and let
  // refundOrder own the transition (refund + status → REFUNDED + notify
  // happen atomically inside one transaction). If we UPDATE'd to CANCELLED
  // first, refundOrder's `status === 'CANCELLED'` guard would short-circuit
  // the refund. The same guard still protects against double refunds when
  // an admin-cancel (which sets status = CANCELLED + refunds in /admin/merch)
  // bounces back to us as an `order_canceled` webhook.
  let shippedRowCount = 0
  if (REFUND_EVENTS.has(event.type)) {
    try {
      await refundOrder(
        pg,
        printfulOrderId,
        event.type,
        event.data.order.status
      )
    } catch (e: unknown) {
      console.error(
        `Printful webhook auto-refund failed for ${printfulOrderId}:`,
        e
      )
    }
  } else {
    try {
      if (newStatus === 'SHIPPED') {
        const result = await pg.result(
          `UPDATE shop_orders
           SET status = 'SHIPPED',
               shipped_time = now(),
               printful_status = $2
           WHERE printful_order_id = $1
           AND status NOT IN ('SHIPPED', 'CANCELLED', 'REFUNDED', 'FAILED')`,
          [printfulOrderId, event.data.order.status]
        )
        shippedRowCount = result.rowCount ?? 0
      } else {
        await pg.none(
          `UPDATE shop_orders
           SET status = $2,
               printful_status = $3
           WHERE printful_order_id = $1
           AND status NOT IN ('CANCELLED', 'REFUNDED')`,
          [printfulOrderId, newStatus, event.data.order.status]
        )
      }
    } catch (e: unknown) {
      console.error('Printful webhook DB update failed:', e)
      res.status(500).send('Internal error')
      return
    }
  }

  // Package returned — needs manual admin review, no auto-refund
  if (MANUAL_REVIEW_EVENTS.has(event.type)) {
    console.error(
      `ACTION REQUIRED: Printful package returned for order ${printfulOrderId}. ` +
      `Check /admin/merch and contact the user to resolve.`
    )
  }

  // Notify user on shipped orders (only if the update actually changed a row)
  if (newStatus === 'SHIPPED' && shippedRowCount > 0) {
    try {
      await notifyShipped(pg, printfulOrderId)
    } catch (e: unknown) {
      console.warn(`Merch shipped notification failed for ${printfulOrderId}:`, e)
    }
  }

  res.status(200).send('OK')
}

async function refundOrder(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  printfulOrderId: string,
  eventType: string,
  printfulStatus: string
) {
  const order = await pg.oneOrNone(
    `SELECT id, user_id, item_id, price_mana, status
     FROM shop_orders WHERE printful_order_id = $1`,
    [printfulOrderId]
  )
  if (!order) return
  // Status guard: an admin-cancel via /admin/merch already set status to
  // CANCELLED and refunded the user. When Printful bounces the resulting
  // `order_canceled` webhook back at us, we early-return here — no double
  // refund. Same logic for already-REFUNDED rows from a duplicate webhook.
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) return

  const amount = Number(order.price_mana)
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`Webhook refund skipped: invalid price_mana for order ${order.id}`)
    return
  }

  let didRefund = false
  await betsQueue.enqueueFn(
    () =>
      runTransactionWithRetries(async (tx) => {
        // Re-check status under lock to prevent double-refund
        const locked = await tx.oneOrNone(
          `SELECT status FROM shop_orders WHERE id = $1 FOR UPDATE`,
          [order.id]
        )
        if (!locked || ['CANCELLED', 'REFUNDED'].includes(locked.status)) return

        const refundTxn: TxnData = {
          category: 'SHOP_PURCHASE',
          fromType: 'BANK',
          fromId: 'BANK',
          toType: 'USER',
          toId: order.user_id,
          amount,
          token: 'M$',
          description: `Auto-refund: Printful ${eventType} (order ${order.id})`,
          data: {
            itemId: order.item_id,
            merchOrder: true,
            refund: true,
            printfulOrderId,
            shopOrderId: order.id,
          },
        }

        await runTxnOutsideBetQueue(tx, refundTxn)
        await tx.none(
          `UPDATE shop_orders
           SET status = 'REFUNDED', printful_status = $2
           WHERE id = $1`,
          [order.id, printfulStatus]
        )
        console.warn(`Webhook auto-refund: ${amount} mana to ${order.user_id} (${eventType})`)
        didRefund = true
      }),
    [order.id]
  )

  // Notify the user (only if we actually performed a refund — duplicate
  // webhooks short-circuit before reaching here).
  if (didRefund) {
    try {
      await notifyAutoRefunded(
        pg,
        order.id,
        order.user_id,
        order.item_id,
        amount,
        eventType
      )
    } catch (e: unknown) {
      console.warn(`Auto-refund notification failed for order ${order.id}:`, e)
    }
  }
}

async function notifyAutoRefunded(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  shopOrderId: string,
  userId: string,
  itemId: string,
  refundAmount: number,
  eventType: string
) {
  const item = getShopItem(itemId)
  const itemName = item?.name ?? itemId
  // Different wording depending on whether Printful canceled the order
  // (likely admin-on-Printful-side or stock issue) vs. the order outright
  // failed during fulfillment validation.
  const sourceText =
    eventType === 'order_canceled'
      ? `Your ${itemName} order was canceled by our fulfillment partner ` +
        `and automatically refunded (${formatMoney(refundAmount)}).`
      : `Your ${itemName} order failed at the fulfillment stage and was ` +
        `automatically refunded (${formatMoney(refundAmount)}).`
  const notification: Notification = {
    id: nanoid(6),
    userId,
    reason: 'merch_order_update',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: shopOrderId,
    sourceType: 'merch_order_update',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText,
    data: { itemId, itemName, event: 'auto_refunded', eventType, refundAmount },
  }
  await insertNotificationToSupabase(notification, pg)
}

async function notifyShipped(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  printfulOrderId: string
) {
  const order = await pg.oneOrNone(
    `SELECT id, user_id, item_id FROM shop_orders WHERE printful_order_id = $1`,
    [printfulOrderId]
  )
  if (!order) return

  const item = getShopItem(order.item_id)
  const itemName = item?.name ?? order.item_id

  const notification: Notification = {
    id: nanoid(6),
    userId: order.user_id,
    reason: 'merch_order_update',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: String(order.id),
    sourceType: 'merch_order_update',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: `Your ${itemName} has shipped!`,
    data: { itemId: order.item_id, itemName, event: 'shipped' },
  }

  await insertNotificationToSupabase(notification, pg)
}
