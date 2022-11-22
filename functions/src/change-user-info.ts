import * as admin from 'firebase-admin'
import { z } from 'zod'

import { getUser, getUserByUsername } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { Comment } from '../../common/comment'
import { User } from '../../common/user'
import {
  cleanUsername,
  cleanDisplayName,
} from '../../common/util/clean-username'
import { removeUndefinedProps } from '../../common/util/object'
import { Answer } from '../../common/answer'
import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  username: z.string().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
})

export const changeuserinfo = newEndpoint({}, async (req, auth) => {
  const { username, name, avatarUrl } = validate(bodySchema, req.body)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(400, 'User not found')
  const cleanedUsername = username ? cleanUsername(username) : undefined

  if (username) {
    if (!cleanedUsername) throw new APIError(400, 'Invalid username')
    const otherUserExists = await getUserByUsername(cleanedUsername)
    if (otherUserExists) throw new APIError(400, 'Username already taken')
  }

  // TODO not sure about denying duplicate display names
  try {
    await changeUser(user, {
      username: cleanedUsername,
      name,
      avatarUrl,
    })
    return { message: 'Successfully changed user info.' }
  } catch (e) {
    throw new APIError(400, 'update failed, please revert changes')
  }
})

export const changeUser = async (
  user: User,
  update: {
    username?: string
    name?: string
    avatarUrl?: string
  }
) => {
  if (update.username) update.username = cleanUsername(update.username)
  if (update.name) update.name = cleanDisplayName(update.name)

  // Update contracts, comments, and answers outside of a transaction to avoid contention.
  // Using bulkWriter to supports >500 writes at a time
  const contractSnap = await firestore
    .collection('contracts')
    .where('creatorId', '==', user.id)
    .select()
    .get()

  const contractUpdate: Partial<Contract> = removeUndefinedProps({
    creatorName: update.name,
    creatorUsername: update.username,
    creatorAvatarUrl: update.avatarUrl,
  })

  const commentSnap = await firestore
    .collectionGroup('comments')
    .where('userUsername', '==', user.username)
    .select()
    .get()

  const commentUpdate: Partial<Comment> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

  const answerSnap = await firestore
    .collectionGroup('answers')
    .where('username', '==', user.username)
    .select()
    .get()
  const answerUpdate: Partial<Answer> = removeUndefinedProps(update)

  const betsSnap = await firestore
    .collectionGroup('bets')
    .where('userId', '==', user.id)
    .select()
    .get()
  const betsUpdate: Partial<Bet> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

  const bulkWriter = firestore.bulkWriter()
  const userRef = firestore.collection('users').doc(user.id)
  bulkWriter.update(userRef, removeUndefinedProps(update))
  commentSnap.docs.forEach((d) => bulkWriter.update(d.ref, commentUpdate))
  answerSnap.docs.forEach((d) => bulkWriter.update(d.ref, answerUpdate))
  contractSnap.docs.forEach((d) => bulkWriter.update(d.ref, contractUpdate))
  betsSnap.docs.forEach((d) => bulkWriter.update(d.ref, betsUpdate))

  await bulkWriter.flush()
  console.log('Done writing!')
}

const firestore = admin.firestore()
