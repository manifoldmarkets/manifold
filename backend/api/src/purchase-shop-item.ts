import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue, TxnData } from 'shared/txn/run-txn'
import { isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export const purchaseShopItem: APIHandler<'purchase-shop-item'> = async (
  { itemId, price },
  auth
) => {
  const userId = auth.uid
  if (!userId) throw new APIError(401, 'You must be signed in')

  const pg = createSupabaseDirectClient()

  await pg.tx(async (tx) => {
    const txn: TxnData = {
      category: 'LIKE_PURCHASE',
      fromType: 'USER',
      toType: 'BANK',
      token: 'M$',
      amount: price,
      fromId: userId,
      toId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      data: { itemId },
      description: `Shop purchase: ${itemId}`,
    }

    await runTxnInBetQueue(tx, txn)
  })

  return { success: true }
}
