import { APIError, APIHandler } from './helpers/endpoint'
import { type TxnData, runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { CASH_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'
import { calculateRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'

export const convertCashToMana: APIHandler<'convert-cash-to-mana'> = async (
  { amount },
  auth
) => {
  const pg = createSupabaseDirectClient()

  await pg.tx(async (tx) => {
    const { redeemable } = await calculateRedeemablePrizeCash(tx, auth.uid)

    if (redeemable < amount) {
      throw new APIError(403, 'Not enough redeemable balance')
    }

    // key for equivalence
    const insertTime = Date.now()

    const toBank: TxnData = {
      category: 'CONVERT_CASH',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: amount,
      token: 'CASH',
      description: 'Convert cash to mana',
      data: { insertTime },
    }
    await runTxnInBetQueue(tx, toBank)

    const toYou: TxnData = {
      category: 'CONVERT_CASH_DONE',
      fromType: 'BANK',
      fromId: 'BANK',
      toType: 'USER',
      toId: auth.uid,
      amount: amount * CASH_TO_MANA_CONVERSION_RATE,
      token: 'M$',
      description: 'Convert cash to mana',
      data: { insertTime },
    }
    await runTxnInBetQueue(tx, toYou)
  })
}
