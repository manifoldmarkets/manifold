import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'
import { convertContract } from 'common/supabase/contracts'
import {
  addGroupToContract,
  removeGroupFromContract,
  canUserAddGroupToMarket,
} from 'shared/update-group-contracts-internal'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { revalidateContractStaticProps } from 'shared/utils'
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

  const db = createSupabaseClient()

  const { data: membership } = await db
    .from('group_members')
    .select()
    .eq('member_id', auth.uid)
    .eq('group_id', groupId)
    .single()

  const groupQuery = await db.from('groups').select().eq('id', groupId).single()

  const contractQuery = await db
    .from('contracts')
    .select('data, importance_score, view_count')
    .eq('id', contractId)
    .single()

  if (groupQuery.error) throw new APIError(404, 'Group cannot be found')
  if (contractQuery.error) throw new APIError(404, 'Contract cannot be found')
  const group = groupQuery.data
  const contract = convertContract(contractQuery.data)

  if (contract.visibility == 'private') {
    throw new APIError(403, `tags of private contracts can't be changed`)
  }
  if (group.privacy_status == 'private') {
    throw new APIError(403, `private groups can't be tagged or untagged`)
  }

  if (
    !remove &&
    (contract.groupLinks?.length ?? 0) > MAX_GROUPS_PER_MARKET &&
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
    membership: membership ?? undefined,
  })

  if (!canUpdate) {
    throw new APIError(403, 'Permission denied')
  }

  if (remove) {
    await removeGroupFromContract(contract, group, auth.uid)
  } else {
    await addGroupToContract(contract, group, auth.uid)
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
