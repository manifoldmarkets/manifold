import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { initAdmin } from './script-init'
initAdmin()

import { Contract } from 'common/contract'
import { getValues } from '../utils'

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
