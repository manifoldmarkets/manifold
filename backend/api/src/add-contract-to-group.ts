import * as admin from 'firebase-admin'
import { uniq } from 'lodash'
import { z } from 'zod'

import { Contract } from 'common/contract'
import { isAdmin, isManifoldId, isTrustworthy } from 'common/envs/constants'
import { Group, GroupLink } from 'common/group'
import { APIError, authEndpoint, validate } from './helpers'
import { getUser } from 'shared/utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { addGroupToContract } from 'shared/update-group-contracts-internal'

const bodySchema = z.object({
  groupId: z.string(),
  contractId: z.string(),
})

export const addcontracttogroup = authEndpoint(async (req, auth) => {
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

  if (contract.visibility == 'private') {
    throw new APIError(400, 'You cannot add a group to a private contract')
  }

  if (group.privacyStatus == 'private') {
    throw new APIError(
      400,
      'You cannot add an existing public market to a private group'
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
      `User does not have permission to add this market to group "${group.name}".`
    )
  }

  const ok = await addGroupToContract(contract, group)
  if (!ok) {
    throw new APIError(400, 'Group is already in contract')
  }

  return contract
})

const firestore = admin.firestore()

export function canUserAddGroupToMarket(props: {
  userId: string
  group: Group
  isMarketCreator: boolean
  isManifoldAdmin: boolean
  isTrustworthy: boolean
  userGroupRole?: 'admin' | 'moderator'
  isGroupMember: boolean
}) {
  const {
    userId,
    group,
    isMarketCreator,
    isManifoldAdmin,
    userGroupRole,
    isTrustworthy,
    isGroupMember,
  } = props
  return (
    isManifoldAdmin ||
    // TODO: shouldn't the user still need to be market creator/admin/trustworthy to add a market to a non-public group?
    //if user is admin or moderator of group
    userGroupRole ||
    // if user is creator of group
    group.creatorId === userId ||
    // if user owns the contract and is a public group
    (group.privacyStatus == 'public'
      ? isMarketCreator || isTrustworthy
      : false) ||
    (group.privacyStatus == 'private'
      ? isMarketCreator && isGroupMember
      : false)
  )
}
