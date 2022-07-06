import * as functions from 'firebase-functions'
import { Txn } from 'common/txn'
import { getContract, getUser, log } from './utils'
import { createNotification } from './create-notification'
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

async function handleTipTxn(txn: Txn, eventId: string) {
  // get user sending and receiving tip
  const [sender, receiver] = await Promise.all([
    getUser(txn.fromId),
    getUser(txn.toId),
  ])
  if (!sender || !receiver) {
    log('Could not find corresponding users')
    return
  }

  if (!txn.data?.contractId || !txn.data?.commentId) {
    log('No contractId or comment id in tip txn.data')
    return
  }

  const contract = await getContract(txn.data.contractId)
  if (!contract) {
    log('Could not find contract')
    return
  }

  const commentSnapshot = await firestore
    .collection('contracts')
    .doc(contract.id)
    .collection('comments')
    .doc(txn.data.commentId)
    .get()
  if (!commentSnapshot.exists) {
    log('Could not find comment')
    return
  }
  const comment = commentSnapshot.data() as Comment

  await createNotification(
    txn.id,
    'tip',
    'created',
    sender,
    eventId,
    txn.amount.toString(),
    contract,
    'comment',
    receiver.id,
    txn.data?.commentId,
    comment.text
  )
}
