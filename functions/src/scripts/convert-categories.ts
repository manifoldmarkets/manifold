import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { CATEGORIES, CATEGORIES_POST_FIX } from 'common/categories'
import { Group } from 'common/group'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'

const adminFirestore = admin.firestore()

// get the categories and make a group for each of them
// set the group's chat to disabled
// after creating a group for a category, add all markets assigned to that category
// add a field to contract to indicate that it's in a group
// upon adding a contract to a group, add that slug to the contract's field
// add all users to the group
// during the create market, allow users to add markets to default-public type groups
// in the sidebar, check to make sure a group doesn't have chat disabled

async function convertCategoriesToGroups() {
  const groups = await getValues<Group>(adminFirestore.collection('groups'))
  const contracts = await getValues<Contract>(
    adminFirestore.collection('contracts')
  )
  for (const group of groups) {
    const groupContracts = contracts.filter((contract) =>
      group.contractIds.includes(contract.id)
    )
    for (const contract of groupContracts) {
      await adminFirestore
        .collection('contracts')
        .doc(contract.id)
        .update({
          groupSlugs: uniq([...(contract.groupSlugs ?? []), group.slug]),
        })
    }
  }

  for (const category of Object.values(CATEGORIES)) {
    const markets = await getValues<Contract>(
      adminFirestore
        .collection('contracts')
        .where('lowercaseTags', 'array-contains', category.toLowerCase())
    )
    const slug = category.toLowerCase() + CATEGORIES_POST_FIX
    const oldGroup = await getValues<Group>(
      adminFirestore.collection('groups').where('slug', '==', slug)
    )
    if (oldGroup.length > 0) {
      console.log(`Found old group for ${category}`)
      await adminFirestore.collection('groups').doc(oldGroup[0].id).delete()
    }

    const allUsers = await getValues<User>(adminFirestore.collection('users'))
    const groupUsers = filterDefined(
      allUsers.map((user: User) => {
        if (!user.followedCategories || user.followedCategories.length === 0)
          return user.id
        if (!user.followedCategories.includes(category.toLowerCase()))
          return null
        return user.id
      })
    )

    const newGroupRef = await adminFirestore.collection('groups').doc()
    const newGroup: Group = {
      id: newGroupRef.id,
      name: category,
      slug,
      creatorId: '94YYTk1AFWfbWMpfYcvnnwI1veP2',
      createdTime: Date.now(),
      anyoneCanJoin: true,
      memberIds: ['94YYTk1AFWfbWMpfYcvnnwI1veP2', ...groupUsers],
      about: 'Official group for all things related to ' + category,
      mostRecentActivityTime: Date.now(),
      contractIds: markets.map((market) => market.id),
      chatDisabled: true,
      type: 'default-public',
    }

    await adminFirestore.collection('groups').doc(newGroupRef.id).set(newGroup)

    for (const market of markets) {
      await adminFirestore
        .collection('contracts')
        .doc(market.id)
        .update({
          groupSlugs: uniq([...(market?.groupSlugs ?? []), newGroup.slug]),
        })
    }
  }
}

if (require.main === module) {
  convertCategoriesToGroups()
    .then(() => process.exit())
    .catch(console.log)
}
