import { getValues } from 'functions/src/utils'
import { Group } from 'common/group'
import { Contract } from 'common/contract'
import { initAdmin } from 'functions/src/scripts/script-init'
import * as admin from 'firebase-admin'
import { filterDefined } from 'common/util/array'

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
      const oldGroupLinks = contract.groupLinks ?? []
      const newGroupLinks = filterDefined([
        ...oldGroupLinks,
        group.id
          ? {
              slug: group.slug,
              name: group.name,
              groupId: group.id,
              createdTime: Date.now(),
            }
          : undefined,
      ])
      await adminFirestore.collection('contracts').doc(contract.id).update({
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
