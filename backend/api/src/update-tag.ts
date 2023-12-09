import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, typedEndpoint } from './helpers'
import { convertContract } from 'common/supabase/contracts'
import {
  addGroupToContract,
  removeGroupFromContract,
  canUserAddGroupToMarket,
} from 'shared/update-group-contracts-internal'

export const addOrRemoveGroupFromContract = typedEndpoint(
  'update-tag',
  async (props, auth) => {
    const { contractId, groupId, remove } = props

    const db = createSupabaseClient()

    const { data: membership } = await db
      .from('group_members')
      .select()
      .eq('member_id', auth.uid)
      .eq('group_id', groupId)
      .single()

    const groupQuery = await db
      .from('groups')
      .select()
      .eq('id', groupId)
      .single()

    const contractQuery = await db
      .from('contracts')
      .select()
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
  }
)
