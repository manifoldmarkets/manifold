import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { Reaction } from '../../common/reaction'
import { createLikeNotification } from './create-notification'

const firestore = admin.firestore()

export const onCreateReaction = functions.firestore
  .document('users/{userId}/reactions/{reactionId}')
  .onCreate(async (change) => {
    const reaction = change.data() as Reaction
    console.log('on create reaction', reaction)
    if (reaction.contentType === 'contract') {
      await incrementContractReactions(reaction, 1)
    } else if (reaction.contentType === 'comment') {
      await incrementCommentReactions(reaction, 1)
    }
    await createLikeNotification(reaction)
  })

export const onDeleteReaction = functions.firestore
  .document('users/{userId}/reactions/{reactionId}')
  .onDelete(async (change) => {
    const reaction = change.data() as Reaction
    if (reaction.contentType === 'contract') {
      await incrementContractReactions(reaction, -1)
    } else if (reaction.contentType === 'comment') {
      await incrementCommentReactions(reaction, -1)
    }
  })

// This should technically be counting reaction documents but I haven't seen this method fail yet
const incrementContractReactions = async (reaction: Reaction, num: number) => {
  await firestore
    .collection('contracts')
    .doc(reaction.contentId)
    .update({
      likedByUserCount: FieldValue.increment(num),
    })
}
// This should technically be counting reaction documents but I haven't seen this method fail yet
const incrementCommentReactions = async (reaction: Reaction, num: number) => {
  await firestore
    .collection(`contracts/${reaction.contentParentId}/comments`)
    .doc(reaction.contentId)
    .update({
      likes: FieldValue.increment(num),
    })
}
