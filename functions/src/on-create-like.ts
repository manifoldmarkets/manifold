import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Like } from '../../common/like'
import { getContract, getUser, log } from './utils'
import { createLikeNotification } from './create-notification'
import { TipTxn } from '../../common/txn'

const firestore = admin.firestore()

export const onCreateLike = functions.firestore
  .document('users/{userId}/likes/{likeId}')
  .onCreate(async (change, context) => {
    const like = change.data() as Like
    const { eventId } = context
    await handleCreateLike(like, eventId)
  })

const handleCreateLike = async (like: Like, eventId: string) => {
  const contract = await getContract(like.contractId)
  if (!contract) {
    log('Could not find contract')
    return
  }
  const contractCreator = await getUser(contract.creatorId)
  if (!contractCreator) {
    log('Could not find contract creator')
    return
  }
  const liker = await getUser(like.userId)
  if (!liker) {
    log('Could not find liker')
    return
  }
  let tipTxnData = undefined

  if (like.tipTxnId) {
    const tipTxn = await firestore.collection('txns').doc(like.tipTxnId).get()
    if (!tipTxn.exists) {
      log('Could not find tip txn')
      return
    }
    tipTxnData = tipTxn.data() as TipTxn
  }

  await createLikeNotification(
    liker,
    contractCreator,
    like,
    eventId,
    contract,
    tipTxnData
  )
}
