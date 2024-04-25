import { type Txn } from 'common/txn'
import { type User } from 'common/user'
import * as admin from 'firebase-admin'
import { APIError, APIHandler } from './helpers/endpoint'

export const convertSpiceToMana: APIHandler<'convert-sp-to-mana'> = async (
  { amount },
  auth
) => {
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

    const toBankTxnDoc = firestore.collection('txns').doc()
    const toYouTxnDoc = firestore.collection('txns').doc()

    const now = Date.now()

    const toBank: Txn = {
      id: toBankTxnDoc.id,
      category: 'CONSUME_SPICE',
      fromType: 'USER',
      fromId: user.id,
      toType: 'BANK',
      toId: 'BANK',
      amount: amount,
      token: 'SPICE',
      description: 'Convert prize points to mana',
      data: {
        siblingId: toYouTxnDoc.id,
      },
      createdTime: now,
    }

    const toYou: Txn = {
      id: toYouTxnDoc.id,
      category: 'CONSUME_SPICE_DONE',
      fromType: 'BANK',
      fromId: 'BANK',
      toType: 'USER',
      toId: user.id,
      amount: amount,
      token: 'M$',
      description: 'Convert prize points to mana',
      data: {
        siblingId: toBankTxnDoc.id,
      },
      createdTime: now,
    }

    trans.create(toBankTxnDoc, toBank)
    trans.create(toYouTxnDoc, toYou)
  })
}

const firestore = admin.firestore()
