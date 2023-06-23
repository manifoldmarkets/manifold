import { Contract } from 'common/contract'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { canUserAddGroupToQuestion } from 'api/add-contract-to-group'
import { createSupabaseClient } from 'shared/supabase/init'
import { removeGroupFromContract } from 'shared/update-group-contracts-internal'

const bodySchema = z.object({
  groupId: z.string(),
  contractId: z.string(),
})

export const removecontractfromgroup = authEndpoint(async (req, auth) => {
  const { groupId, contractId } = validate(bodySchema, req.body)

  // get group membership and role TODO: move to single supabase transaction
  const db = createSupabaseClient()

  const membershipQuery = await db
    .from('group_members')
    .select()
    .eq('member_id', auth.uid)
    .eq('group_id', groupId)
    .limit(1)

  const membership = membershipQuery.data?.[0]

  const contractSnap = await firestore.doc(`contracts/${contractId}`).get()
  const groupQuery = await db.from('groups').select().eq('id', groupId).limit(1)

  if (groupQuery.error) throw new APIError(500, groupQuery.error.message)
  if (!groupQuery.data.length) throw new APIError(404, 'Group cannot be found')
  if (!contractSnap.exists) throw new APIError(404, 'Contract cannot be found')

  const group = groupQuery.data[0]
  const contract = contractSnap.data() as Contract

  if (group.privacy_status == 'private' || contract.visibility == 'private') {
    throw new APIError(
      400,
      'You can not remove a private question from a private group!'
    )
  }

  const canAdd = await canUserAddGroupToQuestion({
    userId: auth.uid,
    group,
    contract,
    membership,
  })
  if (!canAdd) {
    throw new APIError(
      400,
      `User does not have permission to remove this question from group "${group.name}".`
    )
  }

  await removeGroupFromContract(contract, group)

  return { success: true }
})

const firestore = admin.firestore()
