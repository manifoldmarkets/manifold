import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { Group, GroupLink } from 'common/group'
import { createSupabaseClient } from './supabase/init'

const firestore = admin.firestore()

export async function addGroupToContract(contract: Contract, group: Group) {
  const db = createSupabaseClient()

  const exists = await db
    .from('group_contracts')
    .select()
    .eq('contract_id', contract.id)
    .eq('group_id', group.id)
    .limit(1)
  if (exists.data?.length) {
    console.log('contract already has group')
    return false
  }

  // insert into group_contracts table
  await db.from('group_contracts').insert({
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
  group: Group
) {
  const db = createSupabaseClient()
  const exists = await db
    .from('group_contracts')
    .select()
    .eq('contract_id', contract.id)
    .eq('group_id', group.id)
    .limit(1)

  if (!exists.data?.length) {
    console.log('contract does not have group')
    return false
  }

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

  return true
}
