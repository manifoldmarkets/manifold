import { APIError, APIHandler } from './helpers/endpoint'
import { type TxnData, insertTxns } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { incrementBalance } from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import { CASH_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'
import { calculateRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'

export const convertCashToMana: APIHandler<'convert-cash-to-mana'> = async (
  { amount },
  auth
) => {
  const pg = createSupabaseDirectClient()

  await betsQueue.enqueueFn(async () => {
    // check if user has enough cash
    await pg.tx(async (tx) => {
      const redeemable = await calculateRedeemablePrizeCash(auth.uid, tx)
      if (redeemable < amount) {
        throw new APIError(403, 'Not enough redeemable balance')
      }

      await incrementBalance(tx, auth.uid, {
        cashBalance: -amount,
        balance: amount * CASH_TO_MANA_CONVERSION_RATE,
      })
    })

    // key for equivalence
    const insertTime = Date.now()

    const toBank: TxnData = {
      category: 'CONVERT_CASH',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: amount,
      token: 'SPICE',
      description: 'Convert cash to mana',
      data: { insertTime },
    }

    const toYou: TxnData = {
      category: 'CONVERT_CASH_DONE',
      fromType: 'BANK',
      fromId: 'BANK',
      toType: 'USER',
      toId: auth.uid,
      amount: amount,
      token: 'M$',
      description: 'Convert cash to mana',
      data: {
        insertTime,
      },
    }

    await pg.tx((tx) => insertTxns(tx, [toBank, toYou]))
  }, [auth.uid])
}
