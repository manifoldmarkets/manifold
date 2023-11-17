import { DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
} from 'common/contract'
import { User } from 'common/user'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { removeUndefinedProps } from 'common/util/object'
import { RESERVED_PATHS } from 'common/envs/constants'
import * as admin from 'firebase-admin'
import { uniq } from 'lodash'
import { getUser, getUserByUsername } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { GCPLog } from 'shared/utils'

type ChoiceContract = FreeResponseContract | MultipleChoiceContract

const bodySchema = z
  .object({
    username: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    avatarUrl: z.string().optional(),
  })
  .strict()

export const changeuserinfo = authEndpoint(async (req, auth, log, logError) => {
  const { username, name, avatarUrl } = validate(bodySchema, req.body)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(401, 'Your account was not found')
  const cleanedUsername = username ? cleanUsername(username) : undefined

  if (username) {
    if (!cleanedUsername) throw new APIError(400, 'Invalid username')
    const reservedName = RESERVED_PATHS.includes(cleanedUsername)
    if (reservedName) throw new APIError(403, 'This username is reserved')
    const otherUserExists = await getUserByUsername(cleanedUsername)
    if (otherUserExists) throw new APIError(403, 'Username already taken')
  }

  try {
    await changeUser(
      user,
      {
        username: cleanedUsername,
        name,
        avatarUrl,
      },
      log
    )
    return { message: 'Successfully changed user info.' }
  } catch (e) {
    logError(e)
    throw new APIError(500, 'update failed, please revert changes')
  }
})

export const changeUser = async (
  user: User,
  update: {
    username?: string
    name?: string
    avatarUrl?: string
  },
  log: GCPLog
) => {
  const pg = createSupabaseDirectClient()
  const firestore = admin.firestore()
  const bulkWriter = firestore.bulkWriter()

  if (update.username) update.username = cleanUsername(update.username)
  if (update.name) update.name = cleanDisplayName(update.name)

  const userRef = firestore.collection('users').doc(user.id)
  bulkWriter.update(userRef, removeUndefinedProps(update))

  log('Updating denormalized user data on contracts...')
  const contractRows = await pg.manyOrNone(
    `select id from contracts where creator_id = $1`,
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
  log(`Updated ${contractRows.length} contracts.`)

  log('Updating denormalized user data on comments...')
  const commentRows = await pg.manyOrNone(
    `select contract_id, comment_id from contract_comments where user_id = $1`,
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
  log(`Updated ${commentRows.length} comments.`)

  log('Updating denormalized user data on bets...')
  const betRows = await pg.manyOrNone(
    `select contract_id, bet_id from contract_bets where user_id = $1`,
    [user.id]
  )
  const betUpdate: Partial<Bet> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })
  for (const row of betRows) {
    const ref = firestore
      .collection('contracts')
      .doc(row.contract_id)
      .collection('bets')
      .doc(row.bet_id)
    bulkWriter.update(ref, betUpdate)
  }
  log(`Updated ${betRows.length} bets.`)

  log('Updating denormalized user data on answers...')
  const answerRows = await pg.manyOrNone(
    `select contract_id, answer_id from contract_answers where data->>'userId' = $1`,
    [user.id]
  )
  const answerUpdate: Partial<DpmAnswer> = removeUndefinedProps(update)
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
  log(`Updated ${answerRows.length} answers.`)

  await bulkWriter.flush()
  log('Done writing!')
}
