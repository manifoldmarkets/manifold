import { Contract } from 'common/contract'
import { isAdmin, isManifoldId, isTrustworthy } from 'common/envs/constants'
import { Group } from 'common/group'
import { GroupMember } from 'common/group-member'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { canUserAddGroupToMarket } from 'api/add-contract-to-group'
import { getUser } from 'shared/utils'

const bodySchema = z.object({
  groupId: z.string(),
  contractId: z.string(),
}).strict()

export const removecontractfromgroup = authEndpoint(async (req, auth) => {
  const { groupId, contractId } = validate(bodySchema, req.body)

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const groupMemberDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${auth.uid}`
    )
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const groupDoc = firestore.doc(`groups/${groupId}`)
    const [groupMemberSnap, contractSnap, groupSnap] = await transaction.getAll(
      groupMemberDoc,
      contractDoc,
      groupDoc
    )

    let groupMember

    if (!groupSnap.exists) throw new APIError(400, 'Group cannot be found')
    if (!contractSnap.exists)
      throw new APIError(400, 'Contract cannot be found')
    if (!groupMemberSnap.exists) groupMember = undefined
    else {
      groupMember = groupMemberSnap.data() as GroupMember
    }

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
        userGroupRole: groupMember
          ? (groupMember.role as 'admin' | 'moderator')
          : undefined,
        isTrustworthy: isTrustworthy(user?.username),
      })
    ) {
      throw new APIError(
        400,
        `User does not have permission to remove this market from group "${group.name}".`
      )
    }

    if (!contract.groupLinks || !contract.groupSlugs) {
      throw new APIError(400, 'This group does not have any markets to remove')
    }

    if (!contract.groupLinks?.some((l) => l.groupId === group.id)) {
      throw new APIError(400, 'This contract does not exist in the group')
    }

    const newGroupLinks = contract.groupLinks.filter(
      (groupLink) => groupLink.groupId != group.id
    )
    const newGroupSlugs = contract.groupSlugs.filter(
      (groupSlug) => groupSlug != group.slug
    )
    transaction.update(contractDoc, {
      groupSlugs: newGroupSlugs,
      groupLinks: newGroupLinks,
    })
    return contract
  })
})

const firestore = admin.firestore()
