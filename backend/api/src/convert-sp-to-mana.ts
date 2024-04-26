import { type User } from 'common/user'
import * as admin from 'firebase-admin'
import { APIError, APIHandler } from './helpers/endpoint'
import { type TxnData, insertTxns } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const convertSpiceToMana: APIHandler<'convert-sp-to-mana'> = async (
  { amount },
  auth
) => {
  const pg = createSupabaseDirectClient()

  // check if user has enough spice
  await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await trans.get(userDoc)
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const user = userSnap.data() as User

    if (user.spiceBalance < amount) {
      throw new APIError(403, 'Not enough balance')
    }

    // convert
    trans.update(userDoc, {
      spiceBalance: admin.firestore.FieldValue.increment(-amount),
      balance: admin.firestore.FieldValue.increment(amount),
    })
  })

  // key for equivalence
  const insertTime = Date.now()

  const toBank: TxnData = {
    category: 'CONSUME_SPICE',
    fromType: 'USER',
    fromId: auth.uid,
    toType: 'BANK',
    toId: 'BANK',
    amount: amount,
    token: 'SPICE',
    description: 'Convert prize points to mana',
    data: { insertTime },
  }

  const toYou: TxnData = {
    category: 'CONSUME_SPICE_DONE',
    fromType: 'BANK',
    fromId: 'BANK',
    toType: 'USER',
    toId: auth.uid,
    amount: amount,
    token: 'M$',
    description: 'Convert prize points to mana',
    data: {
      insertTime,
    },
  }

  await pg.tx((tx) => insertTxns(tx, [toBank, toYou]))
}

const firestore = admin.firestore()
