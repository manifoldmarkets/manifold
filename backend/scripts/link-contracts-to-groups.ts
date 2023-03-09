import { getValues } from 'shared/utils'
import { Group } from 'common/group'
import { Contract } from 'common/contract'
import { initAdmin } from 'shared/init-admin'
import * as admin from 'firebase-admin'
import { filterDefined } from 'common/util/array'
import { uniq } from 'lodash'

initAdmin()

const adminFirestore = admin.firestore()

const addGroupIdToContracts = async () => {
  const groups = await getValues<Group>(adminFirestore.collection('groups'))

  for (const group of groups) {
    const groupContracts = await getValues<Contract>(
      adminFirestore
        .collection('contracts')
        .where('groupSlugs', 'array-contains', group.slug)
    )

    for (const contract of groupContracts) {
      const oldGroupLinks = contract.groupLinks?.filter(
        (l) => l.slug != group.slug
      )
      const newGroupLinks = filterDefined([
        ...(oldGroupLinks ?? []),
        group.id
          ? {
              slug: group.slug,
              name: group.name,
              groupId: group.id,
              createdTime: Date.now(),
            }
          : undefined,
      ])
      await adminFirestore
        .collection('contracts')
        .doc(contract.id)
        .update({
          groupSlugs: uniq([...(contract.groupSlugs ?? []), group.slug]),
          groupLinks: newGroupLinks,
        })
    }
  }
}

if (require.main === module) {
  addGroupIdToContracts()
    .then(() => process.exit())
    .catch(console.log)
}
