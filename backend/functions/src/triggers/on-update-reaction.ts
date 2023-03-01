import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { richTextToString } from 'common/util/parse'
import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Reaction } from 'common/reaction'
import { getUser } from 'shared/utils'
import {
  createLikeNotification,
  createTopLevelLikedCommentNotification,
} from '../create-notification'

const firestore = admin.firestore()
const MINIMUM_LIKES_TO_NOTIFY = 1

export const onCreateReaction = functions.firestore
  .document('users/{userId}/reactions/{reactionId}')
  .onCreate(async (change, context) => {
    const { eventId } = context
    const reaction = change.data() as Reaction
    const { type } = reaction
    const { count, otherReactions } = await updateCountsOnDocuments(reaction)
    if (type === 'like') {
      await createLikeNotification(reaction)
    }
    if (
      type === 'like' &&
      reaction.contentType === 'comment' &&
      count >= MINIMUM_LIKES_TO_NOTIFY
    ) {
      const commentSnap = await firestore
        .collection(`contracts/${reaction.contentParentId}/comments`)
        .doc(reaction.contentId)
        .get()
      if (!commentSnap.exists) return
      const comment = commentSnap.data() as Comment
      // Only notify on top-level comments (for now)
      if (comment.replyToCommentId) return
      const user = await getUser(comment.userId)
      if (!user) return
      const contractSnap = await firestore
        .collection('contracts')
        .doc(reaction.contentParentId)
        .get()
      if (!contractSnap.exists) return
      const contract = contractSnap.data() as Contract
      await createTopLevelLikedCommentNotification(
        comment.id,
        user,
        richTextToString(comment.content),
        contract,
        eventId,
        otherReactions.map((r) => r.userId)
      )
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
