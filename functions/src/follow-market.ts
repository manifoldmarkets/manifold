import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

const firestore = admin.firestore()

export const addUserToContractFollowers = async (
  contractId: string,
  userId: string
) => {
  const followerDoc = await firestore
    .collection(`contracts/${contractId}/follows`)
    .doc(userId)
    .get()
  if (followerDoc.exists) return
  await firestore
    .collection(`contracts/${contractId}/follows`)
    .doc(userId)
    .set({
      id: userId,
      createdTime: Date.now(),
    })
  await firestore
    .collection(`contracts`)
    .doc(contractId)
    .update({
      followerCount: FieldValue.increment(1),
    })
}

export const removeUserFromContractFollowers = async (
  contractId: string,
  userId: string
) => {
  const followerDoc = await firestore
    .collection(`contracts/${contractId}/follows`)
    .doc(userId)
    .get()
  if (!followerDoc.exists) return
  await firestore
    .collection(`contracts/${contractId}/follows`)
    .doc(userId)
    .delete()
  await firestore
    .collection(`contracts`)
    .doc(contractId)
    .update({
      followerCount: FieldValue.increment(-1),
    })
}
