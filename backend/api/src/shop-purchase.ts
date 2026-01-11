import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxnInBetQueue, type TxnData } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { getShopItem } from 'common/shop/items'
import { type UserShopPurchase } from 'common/user'
import { updateUser } from 'shared/supabase/users'

export const shopPurchase: APIHandler<'shop-purchase'> = async (
  { itemId },
  auth
) => {
  const item = getShopItem(itemId)
  if (!item) {
    throw new APIError(404, 'Item not found')
  }

  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  const pg = createSupabaseDirectClient()

  const result = await pg.tx(async (tx) => {
    const user = await getUser(auth.uid, tx)
    if (!user) throw new APIError(401, 'Your account was not found')

    if (user.isBannedFromPosting) {
      throw new APIError(403, 'Your account is banned')
    }

    // Check one-time purchase limit
    if (item.limit === 'one-time') {
      const alreadyOwns = user.shopPurchases?.some(
        (p) => p.itemId === itemId
      )
      if (alreadyOwns) {
        throw new APIError(403, 'You already own this item')
      }
    }

    // Check balance (runTxnInBetQueue will also check, but let's give a better error)
    if (user.balance < item.price) {
      throw new APIError(403, 'Insufficient balance')
    }

    // Create transaction using the standard pattern
    const txnData: TxnData = {
      category: 'SHOP_PURCHASE',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: item.price,
      token: 'M$',
      description: `Purchased ${item.name}`,
      data: { itemId },
    }

    const txn = await runTxnInBetQueue(tx, txnData)

    // Create purchase record
    const purchase: UserShopPurchase = {
      itemId,
      purchasedAt: Date.now(),
      txnId: txn.id,
      ...(item.duration && { expiresAt: Date.now() + item.duration }),
      ...(item.type === 'permanent-toggleable' && { enabled: true }),
    }

    // Add purchase to user's shopPurchases array
    const existingPurchases = user.shopPurchases ?? []
    await updateUser(tx, auth.uid, {
      shopPurchases: [...existingPurchases, purchase],
    })

    // Item-specific effects
    if (itemId === 'streak-forgiveness') {
      await tx.none(
        `UPDATE users
         SET data = jsonb_set(
           COALESCE(data, '{}'),
           '{streakForgiveness}',
           to_jsonb(COALESCE((data->>'streakForgiveness')::int, 0) + 1)
         )
         WHERE id = $1`,
        [auth.uid]
      )
    }

    return { success: true as const, purchase }
  })

  return result
}
