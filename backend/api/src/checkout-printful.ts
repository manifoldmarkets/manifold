import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue, TxnData } from 'shared/txn/run-txn'
import { isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export const checkoutPrintful: APIHandler<'checkout-printful'> = async (
  { recipient, items },
  auth
) => {
  const userId = auth.uid
  if (!userId) throw new APIError(401, 'You must be signed in')
  if (!items || items.length === 0) throw new APIError(400, 'No items')

  const apiKey = process.env.PRINTFUL_KEY
  if (!apiKey) throw new APIError(500, 'PRINTFUL_KEY is not configured')

  const pg = createSupabaseDirectClient()

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

  const orderResp = await make('/orders', {
    recipient,
    items: items.map((it) => ({
      sync_variant_id: it.variantId,
      quantity: it.quantity,
    })),
  })
  const orderId: string = orderResp?.result?.id ?? orderResp?.result?.order?.id
  if (!orderId) throw new APIError(500, 'Failed to create Printful order')

  await make(`/orders/${orderId}/confirm`)

  const totalPrice = 0
  await pg.tx(async (tx) => {
    if (totalPrice > 0) {
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
    }
    for (const it of items) {
      await tx.none(
        `insert into shop_orders
         (user_id, item_id, item_type, price_mana, quantity, txn_id, printful_order_id, status, created_time, metadata)
         values ($1, $2, 'printful', $3, $4, $5, $6, 'FULFILLING', now(), $7)`,
        [
          userId,
          String(it.productId),
          0,
          it.quantity,
          null,
          orderId,
          { variantId: it.variantId, size: it.size, color: it.color },
        ]
      )
    }
  })

  return { success: true, printfulOrderId: orderId }
}
