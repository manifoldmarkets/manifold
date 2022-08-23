import { Contract } from '../../common/lib/contract'
import { User } from '../../common/lib/user'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

const firestore = admin.firestore()

export const addUserToContractFollowers = async (
  contract: Contract,
  user: User
) => {
  const followerDoc = await firestore
    .collection(`contracts/${contract.id}/follows`)
    .doc(user.id)
    .get()
  if (followerDoc.exists) return
  await firestore
    .collection(`contracts/${contract.id}/follows`)
    .doc(user.id)
    .set({
      id: user.id,
      createdTime: Date.now(),
    })
  // TODO: decrement for unfollows
  await firestore
    .collection(`contracts`)
    .doc(contract.id)
    .update({
      followerCount: FieldValue.increment(1),
    })
}
