import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Group } from 'common/group'
import { Contract } from 'common/contract'

const firestore = admin.firestore()

export const onDeleteGroup = functions.firestore
  .document('groups/{groupId}')
  .onDelete(async (change) => {
    const group = change.data() as Group

    // get all contracts with this group's slug
    const contracts = await firestore
      .collection('contracts')
      .where('groupSlugs', 'array-contains', group.slug)
      .get()
    console.log("contracts with group's slug:", contracts)

    for (const doc of contracts.docs) {
      const contract = doc.data() as Contract
      const newGroupLinks = contract.groupLinks?.filter(
        (link) => link.slug !== group.slug
      )

      // remove the group from the contract
      await firestore
        .collection('contracts')
        .doc(contract.id)
        .update({
          groupSlugs: contract.groupSlugs?.filter((s) => s !== group.slug),
          groupLinks: newGroupLinks ?? [],
        })
    }
  })
