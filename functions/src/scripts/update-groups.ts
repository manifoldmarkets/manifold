import * as admin from 'firebase-admin'
import { Group } from 'common/group'
import { initAdmin } from 'functions/src/scripts/script-init'
import { log } from '../utils'

const getGroups = async () => {
  const firestore = admin.firestore()
  const groups = await firestore.collection('groups').get()
  return groups.docs.map((doc) => doc.data() as Group)
}

const createContractIdForGroup = async (
  groupId: string,
  contractId: string
) => {
  const firestore = admin.firestore()
  const now = Date.now()
  const contractDoc = await firestore
    .collection('groups')
    .doc(groupId)
    .collection('groupContracts')
    .doc(contractId)
    .get()
  if (!contractDoc.exists)
    await firestore
      .collection('groups')
      .doc(groupId)
      .collection('groupContracts')
      .doc(contractId)
      .create({
        contractId,
        createdTime: now,
      })
}

const createMemberForGroup = async (groupId: string, userId: string) => {
  const firestore = admin.firestore()
  const now = Date.now()
  const memberDoc = await firestore
    .collection('groups')
    .doc(groupId)
    .collection('groupMembers')
    .doc(userId)
    .get()
  if (!memberDoc.exists)
    await firestore
      .collection('groups')
      .doc(groupId)
      .collection('groupMembers')
      .doc(userId)
      .create({
        userId,
        createdTime: now,
      })
}

const convertGroupFieldsToGroupDocuments = async () => {
  const groups = await getGroups()
  for (const group of groups) {
    log('updating group', group.slug)
    for (const contractId of group.contractIds ?? []) {
      await createContractIdForGroup(group.id, contractId)
    }
    for (const userId of group.memberIds ?? []) {
      await createMemberForGroup(group.id, userId)
    }
  }
}

if (require.main === module) {
  initAdmin()
  convertGroupFieldsToGroupDocuments()
}
