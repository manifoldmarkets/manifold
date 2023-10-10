import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract } from 'common/contract'
import { isAdminId, isTrustworthy } from 'common/envs/constants'
import { GroupResponse } from 'common/group'
import { APIError, authEndpoint, validate } from './helpers'
import { getUser } from 'shared/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { GroupMember } from 'common/group-member'
import { User } from 'common/user'

const bodySchema = z.object({
  groupId: z.string(),
  contractId: z.string(),
})

export const addcontracttogroup = authEndpoint(async (req, auth) => {
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

  if (contract.visibility == 'private') {
    throw new APIError(403, 'You cannot add a group to a private contract')
  }

  if (group.privacy_status == 'private') {
    throw new APIError(
      403,
      'You cannot add an existing public market to a private group'
    )
  }

  const user = await getUser(auth.uid)
  const canAdd = canUserAddGroupToMarket({
    user,
    group,
    contract,
    membership,
  })
  if (!canAdd) {
    throw new APIError(
      403,
      `User does not have permission to add this market to group "${group.name}".`
    )
  }
  const pg = createSupabaseDirectClient()
  const isNew = await addGroupToContract(contract, group, pg, {
    userId: auth.uid,
  })

  return { status: 'success', existed: !isNew }
})

const firestore = admin.firestore()

export function canUserAddGroupToMarket(props: {
  user: User | undefined
  group: GroupResponse
  contract?: Contract
  membership?: GroupMember
}) {
  const { user, group, contract, membership } = props
  if (!user) return false
  const userId = user.id

  const isMarketCreator = !contract || contract.creatorId === userId
  const isManifoldAdmin = isAdminId(userId)
  const trustworthy = isTrustworthy(user.username)

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
