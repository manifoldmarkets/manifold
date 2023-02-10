import * as admin from 'firebase-admin'
import { uniq } from 'lodash'
import { z } from 'zod'

import { getUser, getUserByUsername } from 'shared/utils'
import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { User } from 'common/user'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { removeUndefinedProps } from 'common/util/object'
import { APIError, newEndpoint, validate } from './api'
import { Answer } from 'common/answer'
type ChoiceContract = FreeResponseContract | MultipleChoiceContract

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
    console.error(e)
    throw new APIError(500, 'update failed, please revert changes')
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
    .where('userId', '==', user.id)
    .select()
    .get()

  const commentUpdate: Partial<Comment> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

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

  const contractMetricsSnap = await firestore
    .collection(`users/${user.id}/contract-metrics`)
    .get()

  const contractMetricsUpdate: Partial<ContractMetric> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

  const bulkWriter = firestore.bulkWriter()
  const userRef = firestore.collection('users').doc(user.id)
  bulkWriter.update(userRef, removeUndefinedProps(update))
  commentSnap.docs.forEach((d) => bulkWriter.update(d.ref, commentUpdate))
  contractSnap.docs.forEach((d) => bulkWriter.update(d.ref, contractUpdate))
  betsSnap.docs.forEach((d) => bulkWriter.update(d.ref, betsUpdate))
  contractMetricsSnap.docs.forEach((d) =>
    bulkWriter.update(d.ref, contractMetricsUpdate)
  )

  const answerSnap = await firestore
    .collectionGroup('answers')
    .where('userId', '==', user.id)
    .get()
  const answerUpdate: Partial<Answer> = removeUndefinedProps(update)
  answerSnap.docs.forEach((d) => bulkWriter.update(d.ref, answerUpdate))

  const answerContractIds = uniq(
    answerSnap.docs.map((a) => a.get('contractId') as string)
  )

  const docRefs = answerContractIds.map((c) =>
    firestore.collection('contracts').doc(c)
  )
  // firestore.getall() will fail with zero params, so add this check
  if (docRefs.length > 0) {
    const answerContracts = await firestore.getAll(...docRefs)
    for (const doc of answerContracts) {
      const contract = doc.data() as ChoiceContract
      for (const a of contract.answers) {
        if (a.userId === user.id) {
          a.username = update.username ?? a.username
          a.avatarUrl = update.avatarUrl ?? a.avatarUrl
          a.name = update.name ?? a.name
        }
      }
      bulkWriter.update(doc.ref, { answers: contract.answers })
    }
  }

  await bulkWriter.flush()
  console.log('Done writing!')
}

const firestore = admin.firestore()
