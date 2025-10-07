import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ShopOrder } from 'common/shop/types'

async function fetchPrintfulOrderStatus(orderId: string, apiKey?: string) {
  if (!apiKey) return undefined
  try {
    const resp = await fetch(`https://api.printful.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!resp.ok) return undefined
    const json = await resp.json()
    return (json?.result?.status as string | undefined) ?? undefined
  } catch {
    return undefined
  }
}

export const getShopOrders: APIHandler<'get-shop-orders'> = async (
  _props,
  auth
) => {
  const userId = auth.uid
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone(
    `select id, user_id, item_id, item_type, price_mana, quantity, txn_id,
            printful_order_id, printful_status, status, status_synced_time,
            metadata, created_time, delivered_time
       from shop_orders
      where user_id = $1
      order by created_time desc
    `,
    [userId]
  )

  const apiKey = process.env.PRINTFUL_KEY
  const refreshed: ShopOrder[] = []
  for (const r of rows) {
    let printfulStatus: string | undefined = r.printful_status ?? undefined
    let status: string = r.status
    if (
      r.item_type === 'printful' &&
      r.printful_order_id &&
      status !== 'DELIVERED' &&
      status !== 'CANCELLED' &&
      status !== 'FAILED'
    ) {
      const live = await fetchPrintfulOrderStatus(r.printful_order_id, apiKey)
      if (live && live !== printfulStatus) {
        printfulStatus = live
        if (live === 'fulfilled') status = 'DELIVERED'
        else if (live === 'canceled' || live === 'cancelled')
          status = 'CANCELLED'
        else if (live === 'failed') status = 'FAILED'
        else if (
          live === 'partially_fulfilled' ||
          live === 'inprocess' ||
          live === 'pending'
        )
          status = 'FULFILLING'
        else status = 'PAID'
        await pg.none(
          `update shop_orders
              set printful_status = $1,
                  status = $2,
                  status_synced_time = now(),
                  delivered_time = case when $2 = 'DELIVERED' then now() else delivered_time end
            where id = $3`,
          [printfulStatus, status, r.id]
        )
      }
    }
    refreshed.push({
      id: r.id,
      userId: r.user_id,
      itemId: r.item_id,
      itemType: r.item_type,
      priceMana: Number(r.price_mana),
      quantity: Number(r.quantity),
      txnId: r.txn_id ?? undefined,
      printfulOrderId: r.printful_order_id ?? undefined,
      printfulStatus,
      status: status as any,
      statusSyncedTime: r.status_synced_time ?? undefined,
      metadata: r.metadata ?? undefined,
      createdTime: r.created_time,
      deliveredTime: r.delivered_time ?? undefined,
    })
  }

  return { orders: refreshed }
}
