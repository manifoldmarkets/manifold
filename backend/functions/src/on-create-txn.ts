import * as functions from 'firebase-functions'
import { TipTxn, Txn } from 'common/txn'
import { getContract, getGroup, getUser, log } from 'shared/utils'
import { createTipNotification } from './create-notification'
import * as admin from 'firebase-admin'
import { Comment } from 'common/comment'

const firestore = admin.firestore()

export const onCreateTxn = functions.firestore
  .document('txns/{txnId}')
  .onCreate(async (change, context) => {
    const txn = change.data() as Txn
    const { eventId } = context

    if (txn.category === 'TIP') {
      await handleTipTxn(txn, eventId)
    }
  })

async function handleTipTxn(txn: TipTxn, eventId: string) {
  // get user sending and receiving tip
  const [sender, receiver] = await Promise.all([
    getUser(txn.fromId),
    getUser(txn.toId),
  ])
  if (!sender || !receiver) {
    log('Could not find corresponding users')
    return
  }

  if (!txn.data?.commentId) {
    log('No comment id in tip txn.data')
    return
  }
  let contract = undefined
  let group = undefined
  let commentSnapshot = undefined

  if (txn.data.contractId) {
    contract = await getContract(txn.data.contractId)
    if (!contract) {
      log('Could not find contract')
      return
    }
    commentSnapshot = await firestore
      .collection('contracts')
      .doc(contract.id)
      .collection('comments')
      .doc(txn.data.commentId)
      .get()
  } else if (txn.data.groupId) {
    group = await getGroup(txn.data.groupId)
    if (!group) {
      log('Could not find group')
      return
    }
    commentSnapshot = await firestore
      .collection('groups')
      .doc(group.id)
      .collection('comments')
      .doc(txn.data.commentId)
      .get()
  }

  if (!commentSnapshot || !commentSnapshot.exists) {
    log('Could not find comment')
    return
  }
  const comment = commentSnapshot.data() as Comment

  await createTipNotification(
    sender,
    receiver,
    txn,
    eventId,
    comment.id,
    contract,
    group
  )
}
