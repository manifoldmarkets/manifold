import { createSupabaseDirectClient } from 'shared/supabase/init'
import { from, renderSql, select, where } from 'shared/supabase/sql-builder'
import { APIError, type APIHandler } from './helpers/endpoint'
import {
  addGroupToContract,
  removeGroupFromContract,
  canUserAddGroupToMarket,
} from 'shared/update-group-contracts-internal'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { getContract, revalidateContractStaticProps } from 'shared/utils'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import { isAdminId, isModId } from 'common/envs/constants'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'

export const addOrRemoveTopicFromContract: APIHandler<
  'market/:contractId/group'
> = async (props, auth) => {
  const { contractId, groupId, remove } = props

  const pg = createSupabaseDirectClient()

  const membership = await pg.oneOrNone(
    `select * from group_members where member_id = $1 and group_id = $2`,
    [auth.uid, groupId]
  )

  const group = await pg.oneOrNone(`select * from groups where id = $1`, [
    groupId,
  ])

  const contract = await getContract(pg, contractId)

  if (!group) throw new APIError(404, 'Group cannot be found')
  if (!contract) throw new APIError(404, 'Contract cannot be found')

  const { count: existingCount } = await pg.one(
    renderSql(
      select('count(*)'),
      from('group_contracts'),
      where('contract_id = ${contractId}', { contractId })
    )
  )

  if (
    !remove &&
    (existingCount ?? 0) > MAX_GROUPS_PER_MARKET &&
    !isModId(auth.uid) &&
    !isAdminId(auth.uid) &&
    ![UNSUBSIDIZED_GROUP_ID, UNRANKED_GROUP_ID].includes(groupId)
  ) {
    throw new APIError(
      403,
      `A question can only have up to ${MAX_GROUPS_PER_MARKET} topic tags.`
    )
  }

  const canUpdate = canUserAddGroupToMarket({
    userId: auth.uid,
    group,
    contract,
    membership,
  })

  if (!canUpdate) {
    throw new APIError(403, 'Permission denied')
  }

  if (remove) {
    await removeGroupFromContract(pg, contract, group, auth.uid)
  } else {
    await addGroupToContract(pg, contract, group, auth.uid)
  }

  const continuation = async () => {
    await revalidateContractStaticProps(contract)
    await upsertGroupEmbedding(createSupabaseDirectClient(), groupId)
  }

  return {
    result: { success: true },
    continue: continuation,
  }
}
