import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Group, GroupLink } from '../../common/group'
import { getContract, log } from './utils'
import { uniq } from 'lodash'
import { removeUndefinedProps } from '../../common/util/object'
const firestore = admin.firestore()

export const onUpdateGroup = functions.firestore
  .document('groups/{groupId}')
  .onUpdate(async (change) => {
    const prevGroup = change.before.data() as Group
    const group = change.after.data() as Group

    // Ignore the activity update we just made
    if (prevGroup.mostRecentActivityTime !== group.mostRecentActivityTime)
      return

    if (prevGroup.contractIds.length < group.contractIds.length) {
      await firestore
        .collection('groups')
        .doc(group.id)
        .update({ mostRecentContractAddedTime: Date.now() })
      //TODO: create notification with isSeeOnHref set to the group's /group/slug/questions url
      // but first, let the new /group/slug/chat notification permeate so that we can differentiate between the two
    }

    await firestore
      .collection('groups')
      .doc(group.id)
      .update({ mostRecentActivityTime: Date.now() })
  })

export async function createGroupLinks(
  group: Group,
  contractIds: string[],
  userId?: string
) {
  for (const contractId of contractIds) {
    const contract = await getContract(contractId)
    if (!contract?.groupSlugs?.includes(group.slug)) {
      await firestore
        .collection('contracts')
        .doc(contractId)
        .update({
          groupSlugs: uniq([group.slug, ...(contract?.groupSlugs ?? [])]),
        })
    }
    if (!contract?.groupLinks?.map((gl) => gl.groupId).includes(group.id)) {
      await firestore
        .collection('contracts')
        .doc(contractId)
        .update({
          groupLinks: [
            removeUndefinedProps({
              groupId: group.id,
              name: group.name,
              slug: group.slug,
              userId,
              createdTime: Date.now(),
            }) as GroupLink,
            ...(contract?.groupLinks ?? []),
          ],
        })
    }
  }
}

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
