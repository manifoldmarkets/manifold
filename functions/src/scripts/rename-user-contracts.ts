import * as admin from 'firebase-admin'
import * as _ from 'lodash'
import { Contract } from '../types/contract'
import { getValues } from '../utils'

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// James:
const serviceAccount = require('../../../../Downloads/mantic-markets-firebase-adminsdk-1ep46-820891bb87.json')
// Stephen:
// const serviceAccount = require('../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
const firestore = admin.firestore()

async function renameUserContracts(
  username: string,
  newNames: { name: string; username: string }
) {
  console.log(`Renaming contracts of ${username} to`, newNames)

  const contracts = await getValues<Contract>(
    firestore.collection('contracts').where('creatorUsername', '==', username)
  )

  console.log('Loaded', contracts.length, 'contracts by', username)

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    console.log('Renaming', contract.slug)

    await contractRef.update({
      creatorUsername: newNames.username,
      creatorName: newNames.name,
    } as Partial<Contract>)
  }
}

if (require.main === module)
  renameUserContracts('ManticMarkets', {
    username: 'ManifoldMarkets',
    name: 'Manifold Markets',
  }).then(() => process.exit())
