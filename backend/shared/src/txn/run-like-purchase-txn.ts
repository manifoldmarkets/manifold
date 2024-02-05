import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxn } from './run-txn'
import { LIKE_COST } from 'common/love/constants'

export async function runLikePurchaseTxn(userId: string, targetId: string) {
  const pg = createSupabaseDirectClient()
  return pg.tx((tx) =>
    runTxn(tx, {
      amount: LIKE_COST,
      fromId: userId,
      fromType: 'USER',
      toId: 'BANK',
      toType: 'BANK',
      category: 'LIKE_PURCHASE',
      token: 'M$',
      data: { targetId },
    })
  )
}
