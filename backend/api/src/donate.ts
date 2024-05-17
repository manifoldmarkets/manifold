import * as admin from 'firebase-admin'
import { type APIHandler } from './helpers/endpoint'
import { charities } from 'common/charity'
import { APIError } from 'api/helpers/endpoint'
import { type User } from 'common/user'
import { insertTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  CHARITY_FEE,
  MIN_SPICE_DONATION,
} from 'common/envs/constants'

export const donate: APIHandler<'donate'> = async ({ amount, to }, auth) => {
  const charity = charities.find((c) => c.id === to)
  if (!charity) throw new APIError(404, 'Charity not found')

  const pg = createSupabaseDirectClient()

  await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await trans.get(userDoc)
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const user = userSnap.data() as User

    if (user.spiceBalance < amount) {
      throw new APIError(403, 'Insufficient prize points')
    }

    if (amount < MIN_SPICE_DONATION) {
      throw new APIError(400, 'Minimum donation is 25,000 prize points')
    }

    // deduct spice as part of transaction
    trans.update(userDoc, {
      spiceBalance: admin.firestore.FieldValue.increment(-amount),
    })
  })

  // add donation to charity
  const fee = CHARITY_FEE * amount
  const donation = amount - fee

  const feeTxn = {
    category: 'CHARITY_FEE',
    fromType: 'USER',
    fromId: auth.uid,
    toType: 'BANK',
    toId: 'BANK',
    amount: fee,
    token: 'SPICE',
    data: {
      charityId: charity.id,
    },
  } as const

  const donationTxn = {
    category: 'CHARITY',
    fromType: 'USER',
    fromId: auth.uid,
    toType: 'CHARITY',
    toId: charity.id,
    amount: donation,
    token: 'SPICE',
  } as const

  await pg.tx((tx) => insertTxn(tx, feeTxn))
  await pg.tx((tx) => insertTxn(tx, donationTxn))
}

const firestore = admin.firestore()
