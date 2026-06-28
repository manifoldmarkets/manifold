import { Contract } from 'common/contract'
import { GroupResponse } from 'common/group'
import { SupabaseDirectClient } from './supabase/init'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import { recordContractEdit } from 'shared/record-contract-edit'
import { trackPublicEvent } from 'shared/analytics'
import { isAdminId, isModId } from 'common/envs/constants'
import { GroupMember } from 'common/group-member'
import { updateContract } from './supabase/contracts'
import { FieldVal } from './supabase/utils'

export async function addGroupToContract(
  pg: SupabaseDirectClient,
  contract: Contract,
  group: { id: string; slug: string },
  userId?: string
) {
  // Some callers build the group object from untyped queries — a missing
  // slug would otherwise append a json null to the contract's groupSlugs,
  // breaking blocked-topic filtering.
  let slug = group.slug
  if (!slug) {
    slug = await pg.one(
      `select slug from groups where id = $1`,
      [group.id],
      (r) => r.slug
    )
  }
  // RETURNING 1 lets us skip the slug append on duplicates —
  // FieldVal.arrayConcat would otherwise double-append.
  const inserted = await pg.oneOrNone(
    `insert into group_contracts (contract_id, group_id) values ($1, $2)
     on conflict (contract_id, group_id) do nothing
     returning 1`,
    [contract.id, group.id]
  )
  if (!inserted) return
  await updateContract(pg, contract.id, {
    groupSlugs: FieldVal.arrayConcat(slug),
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

  await trackPublicEvent(userId ?? contract.creatorId, 'add market to topic', {
    contractId: contract.id,
    groupSlug: group.slug,
    inCreateMarket: !userId,
  })
}

export async function removeGroupFromContract(
  pg: SupabaseDirectClient,
  contract: Contract,
  group: { id: string; slug: string },
  userId: string
) {
  // delete from group_contracts table
  await pg.none(
    `delete from group_contracts where contract_id = $1 and group_id = $2`,
    [contract.id, group.id]
  )

  await updateContract(pg, contract.id, {
    groupSlugs: FieldVal.arrayRemove(group.slug),
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
    isMarketCreator ||
    (group.privacy_status === 'curated' && isMember)
  )
}
