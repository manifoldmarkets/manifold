import * as admin from 'firebase-admin'
import { z } from 'zod'

import { getUser } from './utils'
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

  await changeUser(user, { username, name, avatarUrl })
  return { message: 'Successfully changed user info.' }
})

export const changeUser = async (
  user: User,
  update: {
    username?: string
    name?: string
    avatarUrl?: string
  }
) => {
  // Update contracts, comments, and answers outside of a transaction to avoid contention.
  // Using bulkWriter to supports >500 writes at a time
  const contractsRef = firestore
    .collection('contracts')
    .where('creatorId', '==', user.id)

  const contracts = await contractsRef.get()

  const contractUpdate: Partial<Contract> = removeUndefinedProps({
    creatorName: update.name,
    creatorUsername: update.username,
    creatorAvatarUrl: update.avatarUrl,
  })

  const commentSnap = await firestore
    .collectionGroup('comments')
    .where('userUsername', '==', user.username)
    .get()

  const commentUpdate: Partial<Comment> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

  const answerSnap = await firestore
    .collectionGroup('answers')
    .where('username', '==', user.username)
    .get()
  const answerUpdate: Partial<Answer> = removeUndefinedProps(update)

  const bulkWriter = firestore.bulkWriter()
  commentSnap.docs.forEach((d) => bulkWriter.update(d.ref, commentUpdate))
  answerSnap.docs.forEach((d) => bulkWriter.update(d.ref, answerUpdate))
  contracts.docs.forEach((d) => bulkWriter.update(d.ref, contractUpdate))
  await bulkWriter.flush()
  console.log('Done writing!')

  // Update the username inside a transaction
  return await firestore.runTransaction(async (transaction) => {
    if (update.username) {
      update.username = cleanUsername(update.username)
      if (!update.username) {
        throw new APIError(400, 'Invalid username')
      }

      const sameNameUser = await transaction.get(
        firestore.collection('users').where('username', '==', update.username)
      )
      if (!sameNameUser.empty) {
        throw new APIError(400, 'Username already exists')
      }
    }

    if (update.name) {
      update.name = cleanDisplayName(update.name)
    }

    const userRef = firestore.collection('users').doc(user.id)
    const userUpdate: Partial<User> = removeUndefinedProps(update)
    transaction.update(userRef, userUpdate)
  })
}

const firestore = admin.firestore()
