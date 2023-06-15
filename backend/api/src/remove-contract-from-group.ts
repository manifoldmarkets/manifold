import { Contract } from 'common/contract'
import { isAdmin, isManifoldId, isTrustworthy } from 'common/envs/constants'
import { Group } from 'common/group'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { canUserAddGroupToMarket } from 'api/add-contract-to-group'
import { getUser } from 'shared/utils'
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

  const userMembership = (
    await db
      .from('group_members')
      .select()
      .eq('member_id', auth.uid)
      .eq('group_id', groupId)
      .limit(1)
  ).data

  const isGroupMember = !!userMembership && userMembership.length >= 1

  const groupMemberRole = isGroupMember
    ? userMembership[0].role ?? undefined
    : undefined

  const contractSnap = await firestore.doc(`contracts/${contractId}`).get()
  const groupSnap = await firestore.doc(`groups/${groupId}`).get()

  if (!groupSnap.exists) throw new APIError(400, 'Group cannot be found')
  if (!contractSnap.exists) throw new APIError(400, 'Contract cannot be found')

  const group = groupSnap.data() as Group
  const contract = contractSnap.data() as Contract
  const firebaseUser = await admin.auth().getUser(auth.uid)
  const user = await getUser(auth.uid)

  if (group.privacyStatus == 'private' || contract.visibility == 'private') {
    throw new APIError(
      400,
      'You can not remove a private market from a private group!'
    )
  }
  if (
    !canUserAddGroupToMarket({
      userId: auth.uid,
      group: group,
      isMarketCreator: contract.creatorId === auth.uid,
      isManifoldAdmin: isManifoldId(auth.uid) || isAdmin(firebaseUser.email),
      userGroupRole: groupMemberRole as any,
      isTrustworthy: isTrustworthy(user?.username),
      isGroupMember: isGroupMember,
    })
  ) {
    throw new APIError(
      400,
      `User does not have permission to remove this market from group "${group.name}".`
    )
  }

  const ok = await removeGroupFromContract(contract, group)
  if (!ok) {
    throw new APIError(400, 'Group does not have this contract')
  }

  return contract
})

const firestore = admin.firestore()
