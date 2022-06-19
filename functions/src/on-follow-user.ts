import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createNotification } from './create-notification'

export const onFollowUser = functions.firestore
  .document('users/{userId}/follows/{followedUserId}')
  .onCreate(async (change, context) => {
    const { userId } = context.params as {
      userId: string
    }
    const { eventId } = context

    const follow = change.data() as { userId: string; timestamp: number }

    const followingUser = await getUser(userId)
    if (!followingUser) throw new Error('Could not find following user')

    await createNotification(
      followingUser.id,
      'follow',
      'created',
      followingUser,
      eventId,
      '',
      undefined,
      undefined,
      follow.userId
    )
  })
