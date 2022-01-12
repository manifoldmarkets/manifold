import * as admin from 'firebase-admin'

import { Contract } from '../../../common/contract'

type DocRef = admin.firestore.DocumentReference

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// const serviceAccount = require('../../../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')
const serviceAccount = require('../../../../../../Downloads/mantic-markets-firebase-adminsdk-1ep46-820891bb87.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
const firestore = admin.firestore()

async function recalculateContract(contractRef: DocRef, contract: Contract) {
  const startPool = (contract as any).startPool as
    | undefined
    | { YES: number; NO: number }

  if (contract.phantomShares || !startPool) return

  const phantomAnte = startPool.YES + startPool.NO
  const p = startPool.YES ** 2 / (startPool.YES ** 2 + startPool.NO ** 2)

  const phantomShares = {
    YES: Math.sqrt(p) * phantomAnte,
    NO: Math.sqrt(1 - p) * phantomAnte,
  }

  const pool = {
    YES: contract.pool.YES - startPool.YES,
    NO: contract.pool.NO - startPool.NO,
  }

  const totalShares = {
    YES: contract.totalShares.YES + phantomShares.YES,
    NO: contract.totalShares.NO + phantomShares.NO,
  }

  const update: Partial<Contract> = {
    mechanism: 'dpm-2',
    phantomShares,
    pool,
    totalShares,
  }

  await contractRef.update(update)

  console.log('updated', contract.slug, 'with', update)
  console.log()
}

async function recalculateContractTotals() {
  console.log('Migrating ante calculations to DPM-2')

  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    await recalculateContract(contractRef, contract)
  }
}

if (require.main === module)
  recalculateContractTotals().then(() => process.exit())
