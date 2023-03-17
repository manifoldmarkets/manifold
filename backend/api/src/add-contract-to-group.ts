import { Contract } from 'common/contract'
import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group, GroupLink } from 'common/group'
import { GroupMember } from 'common/group-member'
import * as admin from 'firebase-admin'
import { uniq } from 'lodash'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  groupId: z.string(),
  contractId: z.string(),
})

export const addcontracttogroup = authEndpoint(async (req, auth) => {
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

    // check if contract already exists in group
    if (
      contract.groupLinks &&
      contract.groupLinks
        .map((gl) => gl.groupId)
        .some((gid) => gid === group.id)
    )
      throw new APIError(400, 'This market already exists in this group')

    if (
      !canUserAddGroupToMarket({
        userId: auth.uid,
        group: group,
        isMarketCreator: contract.creatorId === auth.uid,
        isManifoldAdmin: isManifoldId(auth.uid) || isAdmin(firebaseUser.email),
        userGroupRole: groupMember
          ? (groupMember.role as 'admin' | 'moderator')
          : undefined,
      })
    ) {
      throw new APIError(
        400,
        `User does not have permission to add this market to group "${group.name}".`
      )
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

export function canUserAddGroupToMarket(props: {
  userId: string
  group: Group
  isMarketCreator: boolean
  isManifoldAdmin: boolean
  userGroupRole?: 'admin' | 'moderator'
}) {
  const { userId, group, isMarketCreator, isManifoldAdmin, userGroupRole } =
    props
  return (
    isManifoldAdmin ||
    //if user is admin or moderator of group
    userGroupRole ||
    // if user is creator of group
    group.creatorId === userId ||
    // if user owns the contract and is a public group
    (isMarketCreator && group.privacyStatus == 'public')
  )
}
