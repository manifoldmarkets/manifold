import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue, TxnData } from 'shared/txn/run-txn'
import { isProd } from 'shared/utils'
import { getEnabledConfigs } from 'common/shop/items'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

// For v1: only digital/other items are processed; printful will be added next
export const checkoutShopCart: APIHandler<'checkout-shop-cart'> = async (
  { items },
  auth
) => {
  const userId = auth.uid
  if (!userId) throw new APIError(401, 'You must be signed in')
  if (items.length === 0) throw new APIError(400, 'No items to checkout')

  const pg = createSupabaseDirectClient()

  // Build price map from shared config
  const configs = getEnabledConfigs()
  const configById = new Map(configs.map((c) => [c.id, c]))

  type Line = { key: string; itemId: string; quantity: number; price: number }
  const lines: Line[] = []
  let skipped = 0
  let total = 0
  for (const { key, quantity } of items) {
    const [kind, rest] = key.split(':')
    if (kind !== 'digital') {
      skipped++
      continue
    }
    const cfg = configById.get(rest)
    if (!cfg || cfg.type !== 'digital') {
      skipped++
      continue
    }
    let price = cfg.price
    // Dynamic pricing for very-rich-badge: base 500k + 100k per prior purchase
    if (rest === 'very-rich-badge') {
      const row = await pg.oneOrNone<{ count: string }>(
        `select count(*) as count from shop_orders where item_id = 'very-rich-badge'`
      )
      const purchased = Number(row?.count ?? 0)
      price = 100000 + purchased * 100000
    }
    lines.push({ key, itemId: rest, quantity, price })
    total += price * quantity
  }

  if (lines.length === 0) return { success: true, processed: 0, skipped }

  const requestedByItem = new Map<string, number>()
  for (const l of lines)
    requestedByItem.set(
      l.itemId,
      (requestedByItem.get(l.itemId) ?? 0) + l.quantity
    )
  for (const [itemId, requestedQty] of requestedByItem.entries()) {
    const cfg = configById.get(itemId)

    // Check per-user limit
    const limit = cfg?.perUserLimit
    if (limit && itemId !== 'very-rich-badge') {
      const existingRow = await pg.oneOrNone<{ q: string }>(
        `select coalesce(sum(quantity), 0) as q from shop_orders where user_id = $1 and item_id = $2`,
        [userId, itemId]
      )
      const existingQty = Number(existingRow?.q ?? 0)
      if (existingQty + requestedQty > limit) {
        throw new APIError(403, `Limit ${limit} per user for ${itemId}`)
      }
    }

    // Check global limit
    const globalLimit = cfg?.globalLimit
    if (globalLimit) {
      const globalRow = await pg.oneOrNone<{ count: string }>(
        `select count(*) as count from user_entitlements where entitlement_id = $1`,
        [itemId]
      )
      const currentGlobalCount = Number(globalRow?.count ?? 0)
      if (currentGlobalCount + requestedQty > globalLimit) {
        throw new APIError(
          403,
          `Only ${globalLimit} available globally for ${itemId}, ${
            globalLimit - currentGlobalCount
          } remaining`
        )
      }
    }
  }

  // Check balance
  const userRow = await pg.oneOrNone(
    `select balance from users where id = $1`,
    [userId]
  )
  if (!userRow) throw new APIError(404, 'User not found')
  const balance: number = Number(userRow.balance ?? 0)
  if (total > balance)
    throw new APIError(403, 'Insufficient balance to complete checkout')

  let processed = 0
  await pg.tx(async (tx) => {
    // Charge once for the total
    const txn: TxnData = {
      category: 'SHOP_PURCHASE',
      fromType: 'USER',
      toType: 'BANK',
      token: 'M$',
      amount: total,
      fromId: userId,
      toId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      data: { items: lines.map((l) => ({ key: l.key, q: l.quantity })) },
      description: `Shop checkout: ${lines.length} item(s)`,
    }
    const txnResult = await runTxnInBetQueue(tx, txn)

    for (const l of lines) {
      await tx.none(
        `insert into shop_orders
         (user_id, item_id, item_type, price_mana, amount_spent_mana, quantity, txn_id, status, delivered_time, created_time, metadata)
         values ($1, $2, 'digital', $3, $4, $5, $6, 'DELIVERED', now(), now(), $7)`,
        [
          userId,
          l.itemId,
          l.price,
          l.price * l.quantity,
          l.quantity,
          txnResult.id,
          { key: l.key },
        ]
      )
      processed += l.quantity
      // Grant entitlement for digital cosmetic items (1:1 by itemId)
      await tx.none(
        `insert into user_entitlements (user_id, entitlement_id)
           values ($1, $2)
         on conflict (user_id, entitlement_id) do nothing`,
        [userId, l.itemId]
      )
    }
  })

  return { success: true, processed, skipped }
}
