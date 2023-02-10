// At some point, someone deleted some contracts from the DB, but they
// didn't delete the group association, so now there are group associations
// for nonexisting contracts, mucking stuff up.

import * as admin from 'firebase-admin'
import { zip } from 'lodash'
import { initAdmin } from './script-init'
import { log } from 'shared/utils'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const groupContractsQuery = firestore.collectionGroup('groupContracts')
  groupContractsQuery.get().then(async (groupContractSnaps) => {
    log(`Loaded ${groupContractSnaps.size} group contract associations.`)
    const contractIds = groupContractSnaps.docs.map((g) => g.data().contractId)
    const contractRefs = contractIds.map((c) =>
      firestore.collection('contracts').doc(c)
    )
    const contractDocs = zip(
      groupContractSnaps.docs,
      await firestore.getAll(...contractRefs)
    )
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const needsFixing = contractDocs.filter(([_gc, c]) => !c!.exists)
    log(`${needsFixing.length} associations are for nonexistent contracts.`)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await Promise.all(needsFixing.map(([gc, _c]) => gc!.ref.delete()))
    log(`Deleted all invalid associations.`)
  })
}
