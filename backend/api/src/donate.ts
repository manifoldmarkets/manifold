import * as admin from 'firebase-admin'
import { type APIHandler } from './helpers/endpoint'
import { charities } from 'common/charity'
import { APIError } from 'api/helpers/endpoint'
import { type User } from 'common/user'
import { type Txn } from 'common/txn'

export const donate: APIHandler<'donate'> = async ({ amount, to }, auth) => {
  const charity = charities.find((c) => c.id === to)
  if (!charity) throw new APIError(404, 'Charity not found')

  await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await trans.get(userDoc)
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const user = userSnap.data() as User

    if (user.spiceBalance < amount) {
      throw new APIError(403, 'Insufficient sp balance')
    }

    // deduct spice as part of transaction
    trans.update(userDoc, {
      spiceBalance: admin.firestore.FieldValue.increment(-amount),
    })

    // add donation to charity
    const txnDoc = firestore.collection('txns').doc()

    const txn: Txn = {
      id: txnDoc.id,
      category: 'CHARITY',
      fromType: 'USER',
      fromId: user.id,
      toType: 'CHARITY',
      toId: charity.id,
      amount: amount,
      token: 'SPICE',
      createdTime: Date.now(),
    }

    trans.create(txnDoc, txn)
  })
}

const firestore = admin.firestore()
