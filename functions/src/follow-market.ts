import * as admin from 'firebase-admin'

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
}
