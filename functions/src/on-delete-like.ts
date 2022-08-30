import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Like } from '../../common/like'
import { getContract, log } from './utils'
import { uniq } from 'lodash'

const firestore = admin.firestore()

export const onDeleteLike = functions.firestore
  .document('users/{userId}/likes/{likeId}')
  .onDelete(async (change) => {
    const like = change.data() as Like
    if (like.type === 'contract') {
      await removeContractLike(like)
    }
  })

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
