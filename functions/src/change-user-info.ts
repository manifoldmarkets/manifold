import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getUser, getUserByUsername, removeUndefinedProps } from './utils'
import { Contract } from '../../common/contract'
import { Comment } from '../../common/comment'
import { User } from '../../common/user'
import { cleanUsername } from '../../common/util/clean-username'

export const changeUserInfo = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        username?: string
        name?: string
        avatarUrl?: string
      },
      context
    ) => {
      const userId = context?.auth?.uid
      if (!userId) return { status: 'error', message: 'Not authorized' }

      const user = await getUser(userId)
      if (!user) return { status: 'error', message: 'User not found' }

      const { username, name, avatarUrl } = data

      return await changeUser(user, { username, name, avatarUrl })
        .then(() => {
          console.log('succesfully changed', user.username, 'to', data)
          return { status: 'success' }
        })
        .catch((e) => {
          console.log('Error', e.message)
          return { status: 'error', message: e.message }
        })
    }
  )

export const changeUser = async (
  user: User,
  update: {
    username?: string
    name?: string
    avatarUrl?: string
  }
) => {
  if (update.username) {
    update.username = cleanUsername(update.username)
    if (!update.username) {
      throw new Error('Invalid username')
    }

    const sameNameUser = await getUserByUsername(update.username)
    if (sameNameUser) {
      throw new Error('Username already exists')
    }
  }

  const userRef = firestore.collection('users').doc(user.id)

  const userUpdate: Partial<User> = removeUndefinedProps(update)
  await userRef.update(userUpdate)

  const contractSnap = await firestore
    .collection('contracts')
    .where('creatorId', '==', user.id)
    .get()

  const contractUpdate: Partial<Contract> = removeUndefinedProps({
    creatorName: update.name,
    creatorUsername: update.username,
    creatorAvatarUrl: update.avatarUrl,
  })
  await Promise.all(contractSnap.docs.map((d) => d.ref.update(contractUpdate)))

  const commentSnap = await firestore
    .collectionGroup('comments')
    .where('userUsername', '==', user.username)
    .get()

  const commentUpdate: Partial<Comment> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

  await Promise.all(commentSnap.docs.map((d) => d.ref.update(commentUpdate)))
}

const firestore = admin.firestore()
