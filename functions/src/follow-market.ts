import * as admin from 'firebase-admin'

const firestore = admin.firestore()

export const addUserToContractFollowers = async (
  contractId: string,
  userId: string
) => {
  try {
    return await firestore
      .collection(`contracts/${contractId}/follows`)
      .doc(userId)
      .create({ id: userId, createdTime: Date.now() })
  } catch (e) {
    // it probably already existed, that's fine
    return
  }
}

export const removeUserFromContractFollowers = async (
  contractId: string,
  userId: string
) => {
  return await firestore
    .collection(`contracts/${contractId}/follows`)
    .doc(userId)
    .delete()
}
