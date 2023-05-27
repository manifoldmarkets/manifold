import { ManaPurchaseTxn } from 'common/txn'
import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'

initAdmin()
const firestore = admin.firestore()

async function doIt() {
  const purchases = await firestore.collection('stripe-purchases').get()

  if (purchases.empty) {
    throw new Error('No purchases found.')
  }

  await firestore.runTransaction(async (trans) => {
    purchases.docs.forEach((doc) => {
      const purchase = doc.data()
      const { manticDollarQuantity, userId, timestamp } = purchase
      const txnRef = firestore.collection('txns').doc()
      const txn: ManaPurchaseTxn = {
        id: txnRef.id,
        fromId: 'EXTERNAL',
        fromType: 'BANK',
        toId: userId,
        toType: 'USER',
        amount: manticDollarQuantity,
        token: 'M$',
        category: 'MANA_PURCHASE',
        data: {
          stripeTransactionId: doc.id,
          type: 'stripe',
        },
        createdTime: timestamp,
      }
      trans.update(txnRef, txn)
    })
  })
}

if (require.main === module) {
  doIt()
}
