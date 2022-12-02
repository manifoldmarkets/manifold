import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getValues } from '../utils'
import { FieldValue } from 'firebase-admin/firestore'
import { Contract } from 'common/contract'

initAdmin()

const firestore = admin.firestore()

async function main() {
  const contracts = await getValues<Contract>(firestore.collection('contracts'))
  await Promise.all(
    contracts.map(async (contract) => {
      await firestore.collection('contracts').doc(contract.id).update({
        likedByUserIds: FieldValue.delete(),
      })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
