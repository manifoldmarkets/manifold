import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Group } from '../../common/group'
import { getContract } from './utils'
import { uniq } from 'lodash'
const firestore = admin.firestore()

export const onUpdateGroup = functions.firestore
  .document('groups/{groupId}')
  .onUpdate(async (change) => {
    const prevGroup = change.before.data() as Group
    const group = change.after.data() as Group

    // Ignore the activity update we just made
    if (prevGroup.mostRecentActivityTime !== group.mostRecentActivityTime)
      return

    await firestore
      .collection('groups')
      .doc(group.id)
      .update({ mostRecentActivityTime: Date.now() })
  })

export const onCreateGroupContract = functions.firestore
  .document('groups/{groupId}/groupContracts/{contractId}')
  .onCreate(async (change) => {
    const groupId = change.ref.parent.parent?.id
    if (groupId)
      await firestore
        .collection('groups')
        .doc(groupId)
        .update({
          mostRecentContractAddedTime: Date.now(),
          totalContracts: admin.firestore.FieldValue.increment(1),
        })
  })

export const onDeleteGroupContract = functions.firestore
  .document('groups/{groupId}/groupContracts/{contractId}')
  .onDelete(async (change) => {
    const groupId = change.ref.parent.parent?.id
    if (groupId)
      await firestore
        .collection('groups')
        .doc(groupId)
        .update({
          mostRecentContractAddedTime: Date.now(),
          totalContracts: admin.firestore.FieldValue.increment(-1),
        })
  })

export const onCreateGroupMember = functions.firestore
  .document('groups/{groupId}/groupMembers/{memberId}')
  .onCreate(async (change) => {
    const groupId = change.ref.parent.parent?.id
    if (groupId)
      await firestore
        .collection('groups')
        .doc(groupId)
        .update({
          mostRecentActivityTime: Date.now(),
          totalMembers: admin.firestore.FieldValue.increment(1),
        })
  })

export const onDeleteGroupMember = functions.firestore
  .document('groups/{groupId}/groupMembers/{memberId}')
  .onDelete(async (change) => {
    const groupId = change.ref.parent.parent?.id
    if (groupId)
      await firestore
        .collection('groups')
        .doc(groupId)
        .update({
          mostRecentActivityTime: Date.now(),
          totalMembers: admin.firestore.FieldValue.increment(-1),
        })
  })

export async function removeGroupLinks(group: Group, contractIds: string[]) {
  for (const contractId of contractIds) {
    const contract = await getContract(contractId)
    await firestore
      .collection('contracts')
      .doc(contractId)
      .update({
        groupSlugs: uniq([
          ...(contract?.groupSlugs?.filter((slug) => slug !== group.slug) ??
            []),
        ]),
        groupLinks: [
          ...(contract?.groupLinks?.filter(
            (link) => link.groupId !== group.id
          ) ?? []),
        ],
      })
  }
}
