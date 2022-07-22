import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getValues, isProd } from '../utils'
import { CATEGORIES_GROUP_SLUG_POSTFIX } from 'common/categories'
import { Group } from 'common/group'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

initAdmin()

const adminFirestore = admin.firestore()

const addGroupIdToContracts = async () => {
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
}

const convertCategoriesToGroupsInternal = async (categories: string[]) => {
  for (const category of categories) {
    const markets = await getValues<Contract>(
      adminFirestore
        .collection('contracts')
        .where('lowercaseTags', 'array-contains', category.toLowerCase())
    )
    const slug = category.toLowerCase() + CATEGORIES_GROUP_SLUG_POSTFIX
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

    const manifoldAccount = isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
    const newGroupRef = await adminFirestore.collection('groups').doc()
    const newGroup: Group = {
      id: newGroupRef.id,
      name: category,
      slug,
      creatorId: manifoldAccount,
      createdTime: Date.now(),
      anyoneCanJoin: true,
      memberIds: [manifoldAccount],
      about: 'Default group for all things related to ' + category,
      mostRecentActivityTime: Date.now(),
      contractIds: markets.map((market) => market.id),
      chatDisabled: true,
    }

    await adminFirestore.collection('groups').doc(newGroupRef.id).set(newGroup)
    // Update group with new memberIds to avoid notifying everyone
    await adminFirestore
      .collection('groups')
      .doc(newGroupRef.id)
      .update({
        memberIds: uniq(groupUsers),
      })

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

async function convertCategoriesToGroups() {
  // await addGroupIdToContracts()
  // const defaultCategories = Object.values(DEFAULT_CATEGORIES)
  const moreCategories = ['world', 'culture']
  await convertCategoriesToGroupsInternal(moreCategories)
}

if (require.main === module) {
  convertCategoriesToGroups()
    .then(() => process.exit())
    .catch(console.log)
}
