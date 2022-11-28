import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { Contract } from '../../../common/contract'

const firestore = admin.firestore()

async function unlistUserContracts() {
  const userId = 'XzeS8vkUpQOec65vy1Trmgnhz5V2'
  console.log('Updating contracts to be unlisted from user', userId)

  const snapshot = await firestore
    .collection('contracts')
    .where('creatorId', '==', userId)
    .get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')
  await Promise.all(
    contracts.map(async (contract) => {
      const contractRef = firestore.doc(`contracts/${contract.id}`)

      console.log('Updating', contract.question)
      await contractRef.update({ visibility: 'unlisted' })
    })
  )
}

if (require.main === module) unlistUserContracts().then(() => process.exit())
