import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Reaction } from 'common/reaction'
import { createLikeNotification } from '../create-notification'

const firestore = admin.firestore()

export const onCreateReaction = functions.firestore
  .document('users/{userId}/reactions/{reactionId}')
  .onCreate(async (change) => {
    const reaction = change.data() as Reaction
    const { type } = reaction
    await updateCountsOnDocuments(reaction)
    if (type === 'like') {
      await createLikeNotification(reaction)
    }
  })

export const onDeleteReaction = functions.firestore
  .document('users/{userId}/reactions/{reactionId}')
  .onDelete(async (change) => {
    const reaction = change.data() as Reaction
    await updateCountsOnDocuments(reaction)
  })

const updateCountsOnDocuments = async (reaction: Reaction) => {
  const { type, contentType, contentId } = reaction
  const group = firestore
    .collectionGroup('reactions')
    .where('contentType', '==', contentType)
    .where('contentId', '==', contentId)
    .where('type', '==', type)
  const count = (await group.count().get()).data().count
  if (reaction.contentType === 'contract') {
    await updateContractReactions(reaction, count)
  } else if (reaction.contentType === 'comment') {
    await updateCommentReactions(reaction, count)
  }
}

const updateContractReactions = async (reaction: Reaction, count: number) => {
  await firestore.collection('contracts').doc(reaction.contentId).update({
    likedByUserCount: count,
  })
}
const updateCommentReactions = async (reaction: Reaction, count: number) => {
  // getServerCount of reactions with content type and id equal to this comment
  await firestore
    .collection(`contracts/${reaction.contentParentId}/comments`)
    .doc(reaction.contentId)
    .update({
      likes: count,
    })
}
