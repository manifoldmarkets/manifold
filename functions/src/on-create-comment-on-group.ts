import * as functions from 'firebase-functions'
import { Comment } from '../../common/comment'
import * as admin from 'firebase-admin'
import { Group } from '../../common/group'
import { User } from '../../common/user'
import { createGroupCommentNotification } from './create-notification'
const firestore = admin.firestore()

export const onCreateCommentOnGroup = functions.firestore
  .document('groups/{groupId}/comments/{commentId}')
  .onCreate(async (change, context) => {
    const { eventId } = context
    const { groupId } = context.params as {
      groupId: string
    }

    const comment = change.data() as Comment
    const creatorSnapshot = await firestore
      .collection('users')
      .doc(comment.userId)
      .get()
    if (!creatorSnapshot.exists) throw new Error('Could not find user')

    const groupSnapshot = await firestore
      .collection('groups')
      .doc(groupId)
      .get()
    if (!groupSnapshot.exists) throw new Error('Could not find group')

    const group = groupSnapshot.data() as Group
    await firestore.collection('groups').doc(groupId).update({
      mostRecentChatActivityTime: comment.createdTime,
    })

    await Promise.all(
      group.memberIds.map(async (memberId) => {
        return await createGroupCommentNotification(
          creatorSnapshot.data() as User,
          memberId,
          comment,
          group,
          eventId
        )
      })
    )
  })
