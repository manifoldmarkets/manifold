import { Contract } from 'common/contract'
import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group } from 'common/group'
import { GroupMember } from 'common/group-member'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  groupId: z.string(),
  contractId: z.string(),
})

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

    if (group.privacyStatus == 'private') {
      throw new APIError(
        400,
        'You can not remove a market from a private group!'
      )
    }

    // checks if have permission to add a contract to the group
    if (!isManifoldId(auth.uid) && !isAdmin(firebaseUser.email)) {
      if (!groupMember) {
        // checks if is manifold admin (therefore does not have to be a group member)
        throw new APIError(
          400,
          'User is not a member of the group, therefore can not remove any markets'
        )
      } else {
        // must either be admin, moderator or owner of contract to add to group
        if (
          group.creatorId !== auth.uid &&
          groupMember.role !== 'admin' &&
          groupMember.role !== 'moderator' &&
          contract.creatorId !== auth.uid
        )
          throw new APIError(
            400,
            'User does not have permission to remove this market from group'
          )
      }
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
