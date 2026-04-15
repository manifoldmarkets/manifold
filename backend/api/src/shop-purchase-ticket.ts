import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxnOutsideBetQueue, type TxnData } from 'shared/txn/run-txn'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getUser } from 'shared/utils'
import { getShopItem, getTicketItems, isTicketItem } from 'common/shop/items'
import { betsQueue } from 'shared/helpers/fn-queue'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'
import { getBenefit } from 'common/supporter-config'

export const shopPurchaseTicket: APIHandler<'shop-purchase-ticket'> = async (
  { itemId },
  auth
) => {
  const item = getShopItem(itemId)
  if (!item) throw new APIError(404, 'Item not found')
  if (!isTicketItem(item)) throw new APIError(400, 'Item is not a ticket')
  if (item.comingSoon) throw new APIError(403, 'This ticket is not yet available')
  if (!auth) throw new APIError(401, 'Must be logged in')

  // Serialize ALL ticket purchases for this item globally (not per-user) so two
  // different users racing for the last slot can't both pass the stock check.
  const { orderId, remainingStock } = await betsQueue.enqueueFn(
    () =>
      runTransactionWithRetries(async (tx) => {
        const user = await getUser(auth.uid, tx)
        if (!user) throw new APIError(401, 'Your account was not found')
        if (user.isBannedFromPosting)
          throw new APIError(403, 'Your account is banned')

        // One-per-user check across ALL ticket variants — buying early-bird
        // blocks standard (and vice versa). Unique partial index handles the
        // same-item case; this handles cross-variant.
        const allTicketIds = getTicketItems().map((t) => t.id)
        const existing = await tx.oneOrNone(
          `SELECT item_id FROM shop_orders
           WHERE user_id = $1 AND item_id = ANY($2::text[])
           AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')
           LIMIT 1`,
          [auth.uid, allTicketIds]
        )
        if (existing) {
          throw new APIError(
            403,
            'You have already purchased a Manifest ticket (limit 1 per person)'
          )
        }

        // Global stock check. Safe without FOR UPDATE because betsQueue serializes
        // all ticket purchases for this itemId, and runTransactionWithRetries uses
        // serializable isolation as a backstop.
        if (item.maxStock) {
          const { count } = await tx.one<{ count: number }>(
            `SELECT count(*)::int AS count FROM shop_orders
             WHERE item_id = $1
             AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')`,
            [itemId]
          )
          if (count >= item.maxStock) {
            throw new APIError(403, 'Sold out — all tickets have been claimed')
          }
        }

        const supporterEntitlements = await getActiveSupporterEntitlements(
          tx,
          auth.uid
        )
        const shopDiscount = getBenefit(
          supporterEntitlements,
          'shopDiscount',
          0
        )
        const price =
          shopDiscount > 0
            ? Math.floor(item.price * (1 - shopDiscount))
            : item.price

        if (user.balance < price) {
          throw new APIError(403, 'Insufficient balance')
        }

        const discountPct = Math.round(shopDiscount * 100)
        const description =
          discountPct > 0
            ? `Purchased ${item.name} (${discountPct}% supporter discount)`
            : `Purchased ${item.name}`

        const txnData: TxnData = {
          category: 'SHOP_PURCHASE',
          fromType: 'USER',
          fromId: auth.uid,
          toType: 'BANK',
          toId: 'BANK',
          amount: price,
          token: 'M$',
          description,
          data: { itemId, ticketOrder: true, supporterDiscount: shopDiscount },
        }
        const txn = await runTxnOutsideBetQueue(tx, txnData)

        const order = await tx.one<{ id: string }>(
          `INSERT INTO shop_orders (user_id, item_id, price_mana, txn_id, status)
           VALUES ($1, $2, $3, $4, 'COMPLETED')
           RETURNING id`,
          [auth.uid, itemId, price, txn.id]
        )

        const { count: newCount } = await tx.one<{ count: number }>(
          `SELECT count(*)::int AS count FROM shop_orders
           WHERE item_id = $1
           AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')`,
          [itemId]
        )

        return {
          orderId: order.id,
          remainingStock: Math.max(0, (item.maxStock ?? 0) - newCount),
        }
      }),
    [`ticket:${itemId}`]
  )

  return {
    success: true,
    orderId,
    discountCode: process.env.MANIFEST_DISCOUNT_CODE ?? null,
    remainingStock,
  }
}
