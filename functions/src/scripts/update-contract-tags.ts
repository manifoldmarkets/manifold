import * as admin from 'firebase-admin'
import * as _ from 'lodash'

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// James:
const serviceAccount = require('/Users/jahooma/mantic-markets-firebase-adminsdk-1ep46-820891bb87.json')
// Stephen:
// const serviceAccount = require('../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
const firestore = admin.firestore()

import { Contract } from '../../../common/contract'
import { parseTags } from '../../../common/util/parse'
import { getValues } from '../utils'

async function updateContractTags() {
  console.log('Updating contracts tags')

  const contracts = await getValues<Contract>(firestore.collection('contracts'))

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    const tags = _.uniq([
      ...parseTags(contract.question + contract.description),
      ...(contract.tags ?? []),
    ])

    console.log(
      'Updating tags',
      contract.slug,
      'from',
      contract.tags,
      'to',
      tags
    )

    await contractRef.update({
      tags,
    } as Partial<Contract>)
  }
}

if (require.main === module) updateContractTags().then(() => process.exit())
