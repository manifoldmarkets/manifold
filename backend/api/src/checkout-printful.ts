import { APIError, APIHandler } from './helpers/endpoint'
import { runTxnInBetQueue, TxnData } from 'shared/txn/run-txn'
import { isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { getEnabledConfigs } from 'common/shop/items'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { randomUUID } from 'crypto'

export const checkoutPrintful: APIHandler<'checkout-printful'> = async (
  { recipient, items },
  auth
) => {
  const userId = auth.uid
  if (!userId) throw new APIError(401, 'You must be signed in')

  // Enforce max 3 physical items per order
  const totalQty = items.reduce((sum, it) => sum + (it.quantity ?? 0), 0)
  if (totalQty > 3) {
    throw new APIError(
      403,
      'You can include at most 3 physical items per order'
    )
  }

  const apiKey = process.env.PRINTFUL_KEY
  if (!apiKey) throw new APIError(500, 'PRINTFUL_KEY is not configured')

  const reservationId = randomUUID()

  await runTransactionWithRetries(async (tx) => {
    const recentOrder = await tx.oneOrNone<{ exists: boolean }>(
      `select exists(
          select 1 from shop_orders
          where user_id = $1 and item_type = 'printful' and created_time > now() - interval '30 days'
        ) as exists`,
      [userId]
    )
    if (recentOrder?.exists) {
      throw new APIError(
        403,
        'You can place only one physical goods order every 30 days'
      )
    }

    for (const it of items) {
      await tx.none(
        `insert into shop_orders
         (user_id, item_id, item_type, price_mana, quantity, txn_id, printful_order_id, status, created_time, metadata)
         values ($1, $2, 'printful', $3, $4, $5, $6, 'PENDING', now(), $7)`,
        [
          userId,
          String(it.productId),
          0,
          it.quantity,
          null,
          null,
          {
            variantId: it.variantId,
            size: it.size,
            color: it.color,
            reservationId,
          },
        ]
      )
    }
  })

  const make = async (url: string, body?: any) => {
    const resp = await fetch(`https://api.printful.com${url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await resp.json()
    if (!resp.ok) {
      throw new APIError(
        resp.status as any,
        json?.result || json?.message || 'Printful error'
      )
    }
    return json
  }

  let orderId: string | undefined
  try {
    const orderResp = await make('/orders', {
      recipient,
      items: items.map((it) => ({
        sync_variant_id: it.variantId,
        quantity: it.quantity,
      })),
    })
    orderId = orderResp?.result?.id ?? orderResp?.result?.order?.id
    if (!orderId) throw new APIError(500, 'Failed to create Printful order')

    await make(`/orders/${orderId}/confirm`)
  } catch (e) {
    await runTransactionWithRetries(async (tx) => {
      await tx.none(
        `delete from shop_orders where user_id = $1 and item_type = 'printful' and metadata->>'reservationId' = $2`,
        [userId, reservationId]
      )
    })
    throw e
  }

  const printfulPrices = new Map<number, number>()
  for (const c of getEnabledConfigs()) {
    if ((c as any).type === 'printful') {
      const productId = (c as any).printfulProductId as number
      if (productId != null) printfulPrices.set(productId, c.price)
    }
  }

  let totalPrice = 0
  for (const it of items) {
    const price = printfulPrices.get(it.productId)
    if (price == null) {
      await runTransactionWithRetries(async (tx) => {
        await tx.none(
          `delete from shop_orders where user_id = $1 and item_type = 'printful' and metadata->>'reservationId' = $2`,
          [userId, reservationId]
        )
      })
      throw new APIError(
        400,
        `Unknown printful product in order: ${it.productId}. Not configured.`
      )
    }
    totalPrice += price * (it.quantity ?? 0)
  }

  await runTransactionWithRetries(async (tx) => {
    const txn: TxnData = {
      category: 'SHOP_PURCHASE',
      fromType: 'USER',
      toType: 'BANK',
      token: 'M$',
      amount: totalPrice,
      fromId: userId,
      toId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      data: { items },
      description: `Shop checkout (Printful): ${items.length} item(s)`,
    }
    await runTxnInBetQueue(tx, txn)
    for (const it of items) {
      const linePrice = printfulPrices.get(it.productId) ?? 0
      await tx.none(
        `update shop_orders
         set status = 'FULFILLING', printful_order_id = $1, price_mana = $2
         where user_id = $3 and item_type = 'printful' and metadata->>'reservationId' = $4 and item_id = $5`,
        [orderId, linePrice, userId, reservationId, String(it.productId)]
      )
    }
  })

  return { success: true, printfulOrderId: orderId }
}
