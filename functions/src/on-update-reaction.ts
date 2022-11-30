import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { getContract, log } from './utils'
import { FieldValue } from 'firebase-admin/firestore'
import { Reaction } from '../../common/reaction'
import { createLikeNotification } from 'functions/src/create-notification'

const firestore = admin.firestore()

export const onCreateReaction = functions.firestore
  .document('users/{userId}/reactions/{reactionId}')
  .onCreate(async (change, context) => {
    const reaction = change.data() as Reaction
    const { eventId } = context
    // TODO: create liked comment notification and increment comment likedByUserCount
    if (reaction.onType === 'contract') {
      await incrementContractReactions(reaction, 1)
    }
    await createLikeNotification(reaction, eventId)
  })

export const onDeleteReaction = functions.firestore
  .document('users/{userId}/reactions/{reactionId}')
  .onDelete(async (change) => {
    const reaction = change.data() as Reaction
    if (reaction.onType === 'contract') {
      await incrementContractReactions(reaction, -1)
    }
  })

const incrementContractReactions = async (reaction: Reaction, num: number) => {
  const contract = await getContract(reaction.id)
  if (!contract) {
    log('Could not find contract')
    return
  }
  await firestore
    .collection('contracts')
    .doc(reaction.id)
    .update({
      likedByUserCount: FieldValue.increment(num),
    })
}
