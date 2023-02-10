import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getUser } from 'shared/utils'
import { createFollowOrMarketSubsidizedNotification } from './create-notification'
import { FieldValue } from 'firebase-admin/firestore'

export const onFollowUser = functions.firestore
  .document('users/{userId}/follows/{followedUserId}')
  .onCreate(async (change, context) => {
    const { userId, followedUserId } = context.params as {
      userId: string
      followedUserId: string
    }
    const { eventId } = context

    const follow = change.data() as { userId: string; timestamp: number }

    const followingUser = await getUser(userId)
    if (!followingUser) throw new Error('Could not find following user')

    await firestore.doc(`users/${followedUserId}`).update({
      followerCountCached: FieldValue.increment(1),
    })

    await createFollowOrMarketSubsidizedNotification(
      followingUser.id,
      'follow',
      'created',
      followingUser,
      eventId,
      '',
      { recipients: [follow.userId] }
    )
  })

const firestore = admin.firestore()
