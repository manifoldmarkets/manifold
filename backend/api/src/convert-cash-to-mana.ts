import { APIError, APIHandler } from './helpers/endpoint'
import { type TxnData, insertTxns } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { incrementBalance } from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import { CASH_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'

export const convertCashToMana: APIHandler<'convert-cash-to-mana'> = async (
  { amount },
  auth
) => {
  const pg = createSupabaseDirectClient()

  await betsQueue.enqueueFn(async () => {
    // check if user has enough cash
    await pg.tx(async (tx) => {
      const user = await getUser(auth.uid, tx)
      if (!user) throw new APIError(401, 'Your account was not found')

      if (user.cashBalance < amount) {
        throw new APIError(403, 'Not enough balance')
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
