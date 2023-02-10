import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

// TODO: should cache the follower user ids in the contract as these triggers aren't idempotent
export const onDeleteContractFollow = functions.firestore
  .document('contracts/{contractId}/follows/{userId}')
  .onDelete(async (_change, context) => {
    const { contractId } = context.params as { contractId: string }
    const firestore = admin.firestore()
    await firestore
      .collection(`contracts`)
      .doc(contractId)
      .update({
        followerCount: FieldValue.increment(-1),
      })
  })

export const onCreateContractFollow = functions.firestore
  .document('contracts/{contractId}/follows/{userId}')
  .onCreate(async (_change, context) => {
    const { contractId } = context.params as { contractId: string }
    const firestore = admin.firestore()
    await firestore
      .collection(`contracts`)
      .doc(contractId)
      .update({
        followerCount: FieldValue.increment(1),
      })
  })
