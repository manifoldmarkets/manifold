import { Contract } from 'common/contract'
import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group, GroupLink } from 'common/group'
import { GroupMember } from 'common/group-member'
import * as admin from 'firebase-admin'
import { uniq } from 'lodash'
import { z } from 'zod'
import { APIError, newEndpoint, validate } from './helpers'

const bodySchema = z.object({
  groupId: z.string(),
  contractId: z.string(),
})

export const addcontracttogroup = newEndpoint({}, async (req, auth) => {
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

    // checks if have permission to add a contract to the group
    if (!isManifoldId(auth.uid) && !isAdmin(firebaseUser.email)) {
      if (!groupMember) {
        // checks if is manifold admin (therefore does not have to be a group member)
        throw new APIError(
          400,
          'User is not a member of the group, therefore can not add any markets'
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
            'User does not have permission to add this market to group'
          )
        if (
          contract.groupLinks &&
          contract.groupLinks
            .map((gl) => gl.groupId)
            .some((gid) => gid === group.id)
        )
          throw new APIError(400, 'This market already exists in this group')
      }
    }
    const newGroupLinks = [
      ...(contract.groupLinks ?? []),
      {
        groupId: group.id,
        createdTime: Date.now(),
        slug: group.slug,
        userId: auth.uid,
        name: group.name,
      } as GroupLink,
    ]
    transaction.update(contractDoc, {
      groupSlugs: uniq([...(contract.groupSlugs ?? []), group.slug]),
      groupLinks: newGroupLinks,
    })
    return contract
  })
})

const firestore = admin.firestore()
