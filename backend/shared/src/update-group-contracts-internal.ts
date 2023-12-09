import * as admin from 'firebase-admin'
import { Contract } from 'common/contract'
import { GroupLink, GroupResponse } from 'common/group'
import { createSupabaseClient } from './supabase/init'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import { recordContractEdit } from 'shared/record-contract-edit'
import { trackPublicEvent } from 'shared/analytics'
import { isAdminId, isModId } from 'common/envs/constants'
import { GroupMember } from 'common/group-member'

const firestore = admin.firestore()

export async function addGroupToContract(
  contract: Contract,
  group: { id: string; slug: string; name: string },
  userId?: string
) {
  const db = createSupabaseClient()

  // insert into group_contracts table
  await db
    .from('group_contracts')
    .upsert({ group_id: group.id, contract_id: contract.id })

  const linkedToGroupAlready = (contract?.groupLinks ?? []).some(
    (g) => g.groupId === group.id
  )
  if (!linkedToGroupAlready) {
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

    if (group.id === UNRANKED_GROUP_ID) {
      await firestore.collection('contracts').doc(contract.id).update({
        isRanked: false,
      })
      if (userId) {
        await recordContractEdit(contract, userId, ['isRanked'])
      }
    }

    if (group.id === UNSUBSIDIZED_GROUP_ID) {
      await firestore.collection('contracts').doc(contract.id).update({
        isSubsidized: false,
      })
      if (userId) {
        await recordContractEdit(contract, userId, ['isSubsidized'])
      }
    }
  }

  await trackPublicEvent(userId ?? contract.creatorId, 'add market to topic', {
    contractId: contract.id,
    groupSlug: group.slug,
    inCreateMarket: !userId,
  })
}

export async function removeGroupFromContract(
  contract: Contract,
  group: { id: string; slug: string },
  userId: string
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

  if (group.id === UNRANKED_GROUP_ID) {
    await firestore.collection('contracts').doc(contract.id).update({
      isRanked: true,
    })
    await recordContractEdit(contract, userId, ['isRanked'])
  }
  if (group.id === UNSUBSIDIZED_GROUP_ID) {
    await firestore.collection('contracts').doc(contract.id).update({
      isSubsidized: true,
    })
    await recordContractEdit(contract, userId, ['isSubsidized'])
  }
  await trackPublicEvent(userId, 'remove market from topic', {
    contractId: contract.id,
    groupSlug: group.slug,
  })
}

export function canUserAddGroupToMarket(props: {
  userId: string
  group: GroupResponse
  contract?: Contract
  membership?: GroupMember
}) {
  const { userId, group, contract, membership } = props

  const isMarketCreator = !contract || contract.creatorId === userId
  const isManifoldAdmin = isAdminId(userId)
  const trustworthy = isModId(userId)

  const isMember = membership != undefined
  const isAdminOrMod =
    membership?.role === 'admin' || membership?.role === 'moderator'

  return (
    isManifoldAdmin ||
    isAdminOrMod ||
    trustworthy ||
    // if user owns the contract and is a public group
    (group.privacy_status === 'public' && isMarketCreator) ||
    (group.privacy_status === 'private' && isMarketCreator && isMember)
  )
}
