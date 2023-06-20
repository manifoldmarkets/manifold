import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { GroupLink } from 'common/group'
import { createSupabaseClient } from './supabase/init'

const firestore = admin.firestore()

export async function addGroupToContract(
  contract: Contract,
  group: { id: string; slug: string; name: string }
) {
  const db = createSupabaseClient()
  if ((contract?.groupLinks ?? []).some((g) => g.groupId === group.id)) {
    console.log('contract already has group')
    return false
  }

  // insert into group_contracts table
  await db.from('group_contracts').upsert({
    group_id: group.id,
    contract_id: contract.id,
  })

  // update group slugs and group links
  await firestore
    .collection('contracts')
    .doc(contract.id)
    .update({
      groupSlugs: admin.firestore.FieldValue.arrayUnion(group.slug),
      groupLinks: admin.firestore.FieldValue.arrayUnion({
        groupId: group.id,
        createdTime: Date.now(),
        slug: group.slug,
        name: group.name,
      }),
    })

  return true
}

export async function removeGroupFromContract(
  contract: Contract,
  group: { id: string; slug: string }
) {
  const db = createSupabaseClient()

  // delete from group_contracts table
  await db
    .from('group_contracts')
    .delete()
    .eq('contract_id', contract.id)
    .eq('group_id', group.id)

  // update group slugs and group links
  const newLinks = contract.groupLinks?.filter(
    (l: GroupLink) => l.groupId !== group.id
  )
  await firestore
    .collection('contracts')
    .doc(contract.id)
    .update({
      groupSlugs: admin.firestore.FieldValue.arrayRemove(group.slug),
      groupLinks: newLinks,
    })
}
