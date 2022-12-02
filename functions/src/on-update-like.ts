import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Like } from '../../common/like'
import { getContract, getUser, log } from './utils'
import { createLikeNotification } from './create-notification'
import { TipTxn } from '../../common/txn'
import { uniq } from 'lodash'

const firestore = admin.firestore()

export const onCreateLike = functions.firestore
  .document('users/{userId}/likes/{likeId}')
  .onCreate(async (change, context) => {
    const like = change.data() as Like
    const { eventId } = context
    if (like.type === 'contract') {
      await handleCreateLikeNotification(like, eventId)
      await updateContractLikes(like)
    }
  })

export const onUpdateLike = functions.firestore
  .document('users/{userId}/likes/{likeId}')
  .onUpdate(async (change, context) => {
    const like = change.after.data() as Like
    const prevLike = change.before.data() as Like
    const { eventId } = context
    if (like.type === 'contract' && like.tipTxnId !== prevLike.tipTxnId) {
      await handleCreateLikeNotification(like, eventId)
      await updateContractLikes(like)
    }
  })

export const onDeleteLike = functions.firestore
  .document('users/{userId}/likes/{likeId}')
  .onDelete(async (change) => {
    const like = change.data() as Like
    if (like.type === 'contract') {
      await removeContractLike(like)
    }
  })

const updateContractLikes = async (like: Like) => {
  const contract = await getContract(like.id)
  if (!contract) {
    log('Could not find contract')
    return
  }
  const likedByUserIds = uniq(
    (contract.likedByUserIds ?? []).concat(like.userId)
  )
  await firestore
    .collection('contracts')
    .doc(like.id)
    .update({ likedByUserIds, likedByUserCount: likedByUserIds.length })
}

const handleCreateLikeNotification = async (like: Like, eventId: string) => {
  const contract = await getContract(like.id)
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

const removeContractLike = async (like: Like) => {
  const contract = await getContract(like.id)
  if (!contract) {
    log('Could not find contract')
    return
  }
  const likedByUserIds = uniq(contract.likedByUserIds ?? [])
  const newLikedByUserIds = likedByUserIds.filter(
    (userId) => userId !== like.userId
  )
  await firestore.collection('contracts').doc(like.id).update({
    likedByUserIds: newLikedByUserIds,
    likedByUserCount: newLikedByUserIds.length,
  })
}
