import { toUserAPIResponse } from 'common/api/user-types'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { RESERVED_PATHS } from 'common/envs/constants'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { removeUndefinedProps } from 'common/util/object'
import { cloneDeep, uniq } from 'lodash'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getUserByUsername, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import * as admin from 'firebase-admin'

export const updateMe: APIHandler<'me/update'> = async (props, auth) => {
  const firestore = admin.firestore()

  const update = cloneDeep(props)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(401, 'Your account was not found')

  if (update.name) {
    update.name = cleanDisplayName(update.name)
  }

  if (update.username) {
    const cleanedUsername = cleanUsername(update.username)
    if (!cleanedUsername) throw new APIError(400, 'Invalid username')
    const reservedName = RESERVED_PATHS.includes(cleanedUsername)
    if (reservedName) throw new APIError(403, 'This username is reserved')
    const otherUserExists = await getUserByUsername(cleanedUsername)
    if (otherUserExists) throw new APIError(403, 'Username already taken')
    update.username = cleanedUsername
  }

  await firestore.doc(`users/${auth.uid}`).update(removeUndefinedProps(update))
  const { name, username, avatarUrl } = update
  if (name || username || avatarUrl) {
    await updateUserDenormalizedFields(auth.uid, { name, username, avatarUrl })
  }

  return toUserAPIResponse({ ...user, ...update })
}

const updateUserDenormalizedFields = async (
  userId: string,
  update: {
    username?: string
    name?: string
    avatarUrl?: string
  }
) => {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()

  log('Updating denormalized user data on contracts...')

  const bulkWriter = new SafeBulkWriter()

  const contractRows = await pg.manyOrNone(
    `select id from contracts where creator_id = $1`,
    [userId]
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

  const commentUpdate: Partial<ContractComment> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

  const commentIds = await pg.map(
    `update contract_comments
     set data = data || $2
     where user_id = $1
     returning comment_id`,
    [userId, JSON.stringify(commentUpdate)],
    (row) => row.comment_id
  )
  log(`Updated ${commentIds.length} comments.`)

  log('Updating denormalized user data on bets...')
  const betRows = await pg.manyOrNone(
    `select contract_id, bet_id from contract_bets where user_id = $1`,
    [userId]
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

  await bulkWriter.flush()
  log('Done denormalizing!')
}
