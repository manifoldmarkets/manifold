import { Contract } from 'common/contract'
import { GroupLink, GroupResponse } from 'common/group'
import { createSupabaseDirectClient } from './supabase/init'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import { recordContractEdit } from 'shared/record-contract-edit'
import { trackPublicEvent } from 'shared/analytics'
import { isAdminId, isModId } from 'common/envs/constants'
import { GroupMember } from 'common/group-member'
import { manifoldLoveRelationshipsGroupId } from 'common/love/constants'
import { updateContract } from './supabase/contracts'

export async function addGroupToContract(
  contract: Contract,
  group: { id: string; slug: string; name: string },
  userId?: string
) {
  const pg = createSupabaseDirectClient()

  await pg.none(
    `insert into group_contracts (contract_id, group_id) values ($1, $2)`,
    [contract.id, group.id]
  )

  const linkedToGroupAlready = (contract?.groupLinks ?? []).some(
    (g) => g.groupId === group.id
  )
  if (!linkedToGroupAlready) {
    // update group slugs and group links

    const newSlugs = contract.groupSlugs?.concat(group.slug)
    const newLinks = contract.groupLinks?.concat({
      groupId: group.id,
      createdTime: Date.now(),
      slug: group.slug,
      name: group.name,
    })

    await updateContract(pg, contract.id, {
      groupSlugs: newSlugs,
      groupLinks: newLinks,
      lastUpdatedTime: Date.now(),
    })

    if (group.id === UNRANKED_GROUP_ID) {
      await updateContract(pg, contract.id, {
        isRanked: false,
      })
      if (userId) {
        await recordContractEdit(contract, userId, ['isRanked'])
      }
    }

    if (group.id === UNSUBSIDIZED_GROUP_ID) {
      await updateContract(pg, contract.id, {
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
  const pg = createSupabaseDirectClient()

  // delete from group_contracts table
  await pg.none(
    `delete from group_contracts where contract_id = $1 and group_id = $2`,
    [contract.id, group.id]
  )

  // update group slugs and group links
  const newSlugs = contract.groupSlugs?.filter((s) => s !== group.slug)
  const newLinks = contract.groupLinks?.filter(
    (l: GroupLink) => l.groupId !== group.id
  )
  await updateContract(pg, contract.id, {
    groupSlugs: newSlugs,
    groupLinks: newLinks,
    lastUpdatedTime: Date.now(),
  })

  if (group.id === UNRANKED_GROUP_ID) {
    await updateContract(pg, contract.id, {
      isRanked: true,
    })
    await recordContractEdit(contract, userId, ['isRanked'])
  }
  if (group.id === UNSUBSIDIZED_GROUP_ID) {
    await updateContract(pg, contract.id, {
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
  isLove?: boolean
}) {
  const { userId, group, contract, membership, isLove } = props

  const isMarketCreator = !contract || contract.creatorId === userId
  const isManifoldAdmin = isAdminId(userId)
  const trustworthy = isModId(userId)

  const isMember = membership != undefined
  const isAdminOrMod =
    membership?.role === 'admin' || membership?.role === 'moderator'

  if (isLove && group.id === manifoldLoveRelationshipsGroupId) return true

  return (
    isManifoldAdmin ||
    isAdminOrMod ||
    trustworthy ||
    isMarketCreator ||
    (group.privacy_status === 'curated' && isMember)
  )
}
