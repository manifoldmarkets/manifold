import { Request, Response } from 'express'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnOutsideBetQueue, type TxnData } from 'shared/txn/run-txn'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { betsQueue } from 'shared/helpers/fn-queue'

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

// Map Printful statuses to our shop_orders statuses
const STATUS_MAP: Record<string, string> = {
  package_shipped: 'SHIPPED',
  order_canceled: 'CANCELLED',
  order_failed: 'FAILED',
  package_returned: 'FAILED',
}

// Events that should trigger an automatic mana refund
const REFUND_EVENTS = new Set(['order_failed'])

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

  try {
    if (newStatus === 'SHIPPED') {
      await pg.none(
        `UPDATE shop_orders
         SET status = 'SHIPPED',
             shipped_time = now(),
             printful_status = $2
         WHERE printful_order_id = $1
         AND status NOT IN ('CANCELLED', 'REFUNDED', 'FAILED')`,
        [printfulOrderId, event.data.order.status]
      )
    } else {
      await pg.none(
        `UPDATE shop_orders
         SET status = $2,
             printful_status = $3
         WHERE printful_order_id = $1
         AND status NOT IN ('CANCELLED', 'REFUNDED', 'DELIVERED')`,
        [printfulOrderId, newStatus, event.data.order.status]
      )
    }
  } catch (e) {
    console.error('Printful webhook DB update failed:', e)
    res.status(500).send('Internal error')
    return
  }

  // Auto-refund for failed orders
  if (REFUND_EVENTS.has(event.type)) {
    try {
      await refundOrder(pg, printfulOrderId, event.type)
    } catch (e) {
      console.error(`Printful webhook auto-refund failed for ${printfulOrderId}:`, e)
    }
  }

  // Package returned — needs manual admin review, no auto-refund
  if (MANUAL_REVIEW_EVENTS.has(event.type)) {
    console.error(
      `ACTION REQUIRED: Printful package returned for order ${printfulOrderId}. ` +
      `Check /admin/merch and contact the user to resolve.`
    )
  }

  res.status(200).send('OK')
}

async function refundOrder(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  printfulOrderId: string,
  reason: string
) {
  const order = await pg.oneOrNone(
    `SELECT id, user_id, item_id, price_mana, status
     FROM shop_orders WHERE printful_order_id = $1`,
    [printfulOrderId]
  )
  if (!order) return
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) return

  const amount = Number(order.price_mana)
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`Webhook refund skipped: invalid price_mana for order ${order.id}`)
    return
  }

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
          description: `Auto-refund: Printful ${reason} (order ${order.id})`,
          data: { itemId: order.item_id, merchOrder: true, refund: true },
        }

        await runTxnOutsideBetQueue(tx, refundTxn)
        await tx.none(
          `UPDATE shop_orders SET status = 'REFUNDED' WHERE id = $1`,
          [order.id]
        )
        console.warn(`Webhook auto-refund: ${amount} mana to ${order.user_id} (${reason})`)
      }),
    [order.id]
  )
}
