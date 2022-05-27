// We have many old contracts without a collectedFees data structure. Let's fill them in.

import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { noFees } from '../../../common/fees'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const contractsRef = firestore.collection('contracts')
  contractsRef.get().then((contractsSnaps) => {
    let n = 0
    console.log(`Loaded ${contractsSnaps.size} contracts.`)
    contractsSnaps.forEach((ct) => {
      const data = ct.data()
      if (!('collectedFees' in data)) {
        n += 1
        console.log(`Filling in missing fees on contract ${data.id}...`)
        ct.ref.update({ collectedFees: noFees })
      }
    })
    console.log(`Updated ${n} contracts.`)
  })
}
