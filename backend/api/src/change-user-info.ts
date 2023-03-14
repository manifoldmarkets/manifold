import { Answer } from 'common/answer'
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
import * as admin from 'firebase-admin'
import { uniq } from 'lodash'
import { getUser, getUserByUsername } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'

type ChoiceContract = FreeResponseContract | MultipleChoiceContract

const bodySchema = z.object({
  username: z.string().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
})

export const changeuserinfo = authEndpoint(async (req, auth) => {
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
  const pg = createSupabaseDirectClient()
  const firestore = admin.firestore()
  const bulkWriter = firestore.bulkWriter()

  if (update.username) update.username = cleanUsername(update.username)
  if (update.name) update.name = cleanDisplayName(update.name)

  const userRef = firestore.collection('users').doc(user.id)
  bulkWriter.update(userRef, removeUndefinedProps(update))

  const contractRows = await pg.manyOrNone(
    `select id from contracts where data->'creatorId' = $1`,
    [user.id]
  )
  const contractUpdate: Partial<Contract> = removeUndefinedProps({
    creatorName: update.name,
    creatorUsername: update.username,
    creatorAvatarUrl: update.avatarUrl,
  })
  for (const row of contractRows) {
    const ref = firestore.collection('contracts').doc(row.id)
    bulkWriter.update(ref, contractUpdate)
  }

  const commentRows = await pg.manyOrNone(
    `select contract_id, commment_id from contract_comments where data->'userId' = $1`,
    [user.id]
  )
  const commentUpdate: Partial<Comment> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })
  for (const row of commentRows) {
    const ref = firestore
      .collection('contracts')
      .doc(row.contract_id)
      .collection('comments')
      .doc(row.comment_id)
    bulkWriter.update(ref, commentUpdate)
  }

  const betsRows = await pg.manyOrNone(
    `select contract_id, bet_id from contract_bets where data->'userId' = $1`,
    [user.id]
  )
  const betUpdate: Partial<Bet> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })
  for (const row of betsRows) {
    const ref = firestore
      .collection('contracts')
      .doc(row.contract_id)
      .collection('bets')
      .doc(row.bet_id)
    bulkWriter.update(ref, betUpdate)
  }

  const contractMetricsRows = await pg.manyOrNone(
    `select contract_id from contract_metrics where user_id = $1`,
    [user.id]
  )
  const contractMetricsUpdate: Partial<ContractMetric> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })
  for (const row of contractMetricsRows) {
    const ref = firestore
      .collection('users')
      .doc(user.id)
      .collection('contract-metrics')
      .doc(row.contract_id)
    bulkWriter.update(ref, contractMetricsUpdate)
  }

  const answerRows = await pg.manyOrNone(
    `select contract_id, answer_id from contract_answers where data->'userId' = $1`,
    [user.id]
  )
  const answerUpdate: Partial<Answer> = removeUndefinedProps(update)
  for (const row of answerRows) {
    const ref = firestore
      .collection('contracts')
      .doc(row.contract_id)
      .collection('answers')
      .doc(row.answer_id)
    bulkWriter.update(ref, answerUpdate)
  }

  const answerContractIds = uniq(answerRows.map((r) => r.contract_id as string))
  // firestore.getall() will fail with zero params, so add this check
  if (answerContractIds.length > 0) {
    const refs = answerContractIds.map((c) =>
      firestore.collection('contracts').doc(c)
    )
    const answerContracts = await firestore.getAll(...refs)
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
