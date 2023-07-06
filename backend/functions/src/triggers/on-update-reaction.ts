import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Reaction } from 'common/reaction'
import { createLikeNotification } from 'shared/create-notification'
import { secrets } from 'common/secrets'

const firestore = admin.firestore()

export const onCreateReaction = functions
  .runWith({ secrets })
  .firestore.document('users/{userId}/reactions/{reactionId}')
  .onCreate(async (change) => {
    const reaction = change.data() as Reaction
    const { type } = reaction
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
  const otherReactionsOfSameTypeSnap = firestore
    .collectionGroup('reactions')
    .where('contentType', '==', contentType)
    .where('contentId', '==', contentId)
    .where('type', '==', type)
    .get()
  const otherReactions = (await otherReactionsOfSameTypeSnap).docs.map(
    (doc) => doc.data() as Reaction
  )
  const count = otherReactions.length
  if (reaction.contentType === 'contract') {
    await updateContractLikes(reaction, count)
  } else if (reaction.contentType === 'comment') {
    await updateCommentLikes(reaction, count)
  }
  return { otherReactions, count }
}

const updateContractLikes = async (reaction: Reaction, count: number) => {
  await firestore.collection('contracts').doc(reaction.contentId).update({
    likedByUserCount: count,
  })
}
const updateCommentLikes = async (reaction: Reaction, count: number) => {
  // getServerCount of reactions with content type and id equal to this comment
  await firestore
    .collection(`contracts/${reaction.contentParentId}/comments`)
    .doc(reaction.contentId)
    .update({
      likes: count,
    })
}
