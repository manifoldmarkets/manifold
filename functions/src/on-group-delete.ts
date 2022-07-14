import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Group } from 'common/group'
import { Contract } from 'common/contract'
const firestore = admin.firestore()

exports.onGroupDelete = functions.firestore
  .document('groups/{groupId}')
  .onDelete(async (change) => {
    const group = change.data() as Group

    // get all contracts with this group's slug
    const contracts = await firestore
      .collection('contracts')
      .where('groupSlugs', 'array-contains', group.slug)
      .get()

    for (const doc of contracts.docs) {
      const contract = doc.data() as Contract
      // remove the group from the contract
      await firestore
        .collection('contracts')
        .doc(contract.id)
        .update({
          groupSlugs: (contract.groupSlugs ?? []).filter(
            (groupSlug) => groupSlug !== group.slug
          ),
        })
    }
  })
