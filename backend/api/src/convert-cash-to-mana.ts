import { APIError, APIHandler } from './helpers/endpoint'
import { type TxnData, runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { CASH_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'
import { getUser } from 'shared/utils'

export const convertCashToMana: APIHandler<'convert-cash-to-mana'> = async (
  { amount },
  auth
) => {
  const pg = createSupabaseDirectClient()

  await pg.tx(async (tx) => {
    const user = await getUser(auth.uid, tx)
    if (!user) {
      throw new APIError(404, 'User not found')
    }
    const cashBalance = user.cashBalance

    if (cashBalance < amount) {
      throw new APIError(403, 'Not enough balance')
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
