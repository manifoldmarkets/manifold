import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getUser } from './utils'
import { Contract } from 'common/contract'
import { Comment } from 'common/comment'
import { User } from 'common/user'
import { cleanUsername } from 'common/util/clean-username'
import { removeUndefinedProps } from 'common/util/object'
import { Answer } from 'common/answer'

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
  return await firestore.runTransaction(async (transaction) => {
    if (update.username) {
      update.username = cleanUsername(update.username)
      if (!update.username) {
        throw new Error('Invalid username')
      }

      const sameNameUser = await transaction.get(
        firestore.collection('users').where('username', '==', update.username)
      )
      if (!sameNameUser.empty) {
        throw new Error('Username already exists')
      }
    }

    const userRef = firestore.collection('users').doc(user.id)
    const userUpdate: Partial<User> = removeUndefinedProps(update)

    const contractsRef = firestore
      .collection('contracts')
      .where('creatorId', '==', user.id)

    const contracts = await transaction.get(contractsRef)

    const contractUpdate: Partial<Contract> = removeUndefinedProps({
      creatorName: update.name,
      creatorUsername: update.username,
      creatorAvatarUrl: update.avatarUrl,
    })

    const commentSnap = await transaction.get(
      firestore
        .collectionGroup('comments')
        .where('userUsername', '==', user.username)
    )

    const commentUpdate: Partial<Comment> = removeUndefinedProps({
      userName: update.name,
      userUsername: update.username,
      userAvatarUrl: update.avatarUrl,
    })

    const answerSnap = await transaction.get(
      firestore
        .collectionGroup('answers')
        .where('username', '==', user.username)
    )
    const answerUpdate: Partial<Answer> = removeUndefinedProps(update)

    await transaction.update(userRef, userUpdate)

    await Promise.all(
      commentSnap.docs.map((d) => transaction.update(d.ref, commentUpdate))
    )

    await Promise.all(
      answerSnap.docs.map((d) => transaction.update(d.ref, answerUpdate))
    )

    await contracts.docs.map((d) => transaction.update(d.ref, contractUpdate))
  })
}

const firestore = admin.firestore()
