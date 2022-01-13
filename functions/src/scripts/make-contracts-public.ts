import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { Contract } from '../../../common/contract'

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// const serviceAccount = require('../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')
const serviceAccount = require('../../../../../../Downloads/mantic-markets-firebase-adminsdk-1ep46-820891bb87.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
const firestore = admin.firestore()

async function makeContractsPublic() {
  console.log('Updating contracts to be public')

  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    console.log('Updating', contract.question)
    await contractRef.update({ visibility: 'public' })
  }
}

if (require.main === module) makeContractsPublic().then(() => process.exit())
