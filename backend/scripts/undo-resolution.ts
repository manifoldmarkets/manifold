import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()
import { ContractResolutionPayoutTxn } from 'common/txn'
import { chunk } from 'lodash'
import { undoContractPayoutTxn } from 'shared/run-txn'

const firestore = admin.firestore()

const undoResolution = async (contractId: string) => {
  const txns = await firestore
    .collection('txns')
    .where('category', '==', 'CONTRACT_RESOLUTION_PAYOUT')
    .where('fromType', '==', 'CONTRACT')
    .where('fromId', '==', contractId)
    .get()
    .then((snapshot) =>
      snapshot.docs.map((doc) => doc.data() as ContractResolutionPayoutTxn)
    )
  console.log('reverting txns', txns.length)
  const chunkedTxns = chunk(txns, 250)
  for (const chunk of chunkedTxns) {
    await firestore.runTransaction(async (transaction) => {
      for (const txn of chunk) {
        undoContractPayoutTxn(transaction, txn)
      }
    })
  }
  console.log('reverted txns')

  await firestore.doc(`contracts/${contractId}`).update({
    isResolved: false,
    resolutionTime: admin.firestore.FieldValue.delete(),
    resolution: admin.firestore.FieldValue.delete(),
    resolutionProbability: admin.firestore.FieldValue.delete(),
    closeTime: Date.now(),
  })
  console.log('updated contract')
}

if (require.main === module) {
  const contractId = process.argv[2]
  if (!contractId) {
    console.log('Usage: ts-node undo-resolution.ts <contractId>')
    process.exit()
  }
  console.log('reverting resolution for contract:', contractId)
  undoResolution(contractId)
    .then(() => process.exit())
    .catch(console.log)
}
