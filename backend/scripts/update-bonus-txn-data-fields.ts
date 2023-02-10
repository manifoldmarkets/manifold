import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
import { Txn } from 'common/txn'
import { getValues } from 'shared/utils'

initAdmin()

const firestore = admin.firestore()

async function main() {
  // get all txns
  const bonusTxns = await getValues<Txn>(
    firestore
      .collection('txns')
      .where('category', 'in', ['UNIQUE_BETTOR_BONUS', 'BETTING_STREAK_BONUS'])
  )
  // JSON parse description field and add to data field
  const updatedTxns = bonusTxns.map((txn) => {
    txn.data = txn.description && JSON.parse(txn.description)
    return txn
  })
  console.log('updatedTxns', updatedTxns[0])
  // update txns
  await Promise.all(
    updatedTxns.map((txn) => {
      return firestore.collection('txns').doc(txn.id).update({
        data: txn.data,
      })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
