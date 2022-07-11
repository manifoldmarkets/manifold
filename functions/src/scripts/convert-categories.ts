import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { CATEGORIES } from 'common/lib/categories'
import { Group } from 'common/group'
import { util } from 'zod/lib/helpers/util'
import OmitKeys = util.OmitKeys

const firestore = admin.firestore()

// get the categories and make a group for each of them
// set the group to public type
// after creating a group for a category, add all markets assigned to that category
// during the create market, allow users to add markets to public type groups

async function convertCategoriesToGroups() {
  for (const category of Object.values(CATEGORIES)) {
    const markets = await getValues<any>(
      firestore
        .collection('contracts')
        .where('lowercaseTags', 'array-contains', category.toLowerCase())
    )

    const newGroup: OmitKeys<Group, 'id'> = {
      name: category,
      type: 'public',
      slug: category + '-public-test',
      creatorId: '94YYTk1AFWfbWMpfYcvnnwI1veP2',
      createdTime: Date.now(),
      anyoneCanJoin: true,
      memberIds: ['94YYTk1AFWfbWMpfYcvnnwI1veP2'],
      about: category,
      mostRecentActivityTime: Date.now(),
      contractIds: markets.map((market) => market.id),
    }
    await firestore.collection('groups').add(newGroup)
  }
}

if (require.main === module) {
  convertCategoriesToGroups()
    .then(() => process.exit())
    .catch(console.log)
}
