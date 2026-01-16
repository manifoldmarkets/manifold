import { toUserAPIResponse } from 'common/api/user-types'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { BANNED_TRADING_USER_IDS, RESERVED_PATHS } from 'common/envs/constants'
import { TopLevelPost } from 'common/top-level-post'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { removeUndefinedProps } from 'common/util/object'
import { cloneDeep } from 'lodash'
import { trackAuditEvent } from 'shared/audit-events'
import { getStorageBucket } from 'shared/create-user-main'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { generateAvatarUrl } from 'shared/helpers/generate-and-update-avatar-urls'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUser, getUserByUsername, log } from 'shared/utils'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'
import { APIError, APIHandler } from './helpers/endpoint'

export const updateMe: APIHandler<'me/update'> = async (props, auth) => {
  const { userId: targetUserId, ...updateProps } = props
  const update = cloneDeep(updateProps)

  // Determine if this is an admin update or self-update
  const isAdminUpdate = !!targetUserId
  const userId = targetUserId ?? auth.uid
  const user = await getUser(userId)
  if (!user)
    throw new APIError(
      404,
      isAdminUpdate ? 'Target user not found' : 'Your account was not found'
    )

  // If admin update, check admin permissions
  if (isAdminUpdate) {
    throwErrorIfNotAdmin(auth.uid)
  } else {
    if (user.userDeleted) throw new APIError(403, 'Your account is deleted')
    // Only check bans for self-updates, allow admins to update banned users
    if (user.isBannedFromPosting || BANNED_TRADING_USER_IDS.includes(user.id)) {
      throw new APIError(403, 'Your account is banned')
    }
  }
  if (update.name) {
    update.name = cleanDisplayName(update.name)
  }

  if (update.username) {
    // Check if user is restricted from changing username (self-update only, admins can bypass)
    if (!isAdminUpdate && user.canChangeUsername === false) {
      throw new APIError(
        403,
        'You are not allowed to change your username. Contact support if you believe this is an error.'
      )
    }
    const cleanedUsername = cleanUsername(update.username)
    if (!cleanedUsername) throw new APIError(400, 'Invalid username')
    const reservedName = RESERVED_PATHS.includes(cleanedUsername)
    if (reservedName) throw new APIError(403, 'This username is reserved')
    const otherUserExists = await getUserByUsername(cleanedUsername)
    if (otherUserExists && otherUserExists.id !== userId) {
      throw new APIError(403, 'Username already taken')
    }
    update.username = cleanedUsername
  }

  if (update.avatarUrl === '') {
    const bucket = getStorageBucket()
    const newAvatarUrl = await generateAvatarUrl(
      userId,
      user.name,
      bucket,
      true // Have to use random name to deal w/ cache issues
    )
    update.avatarUrl = newAvatarUrl
    log(`Generated new avatar for user ${userId}: ${newAvatarUrl}`)
  }

  const pg = createSupabaseDirectClient()

  const { name, username, avatarUrl, ...rest } = update
  await updateUser(pg, userId, removeUndefinedProps(rest))
  if (name || username || avatarUrl) {
    if (name) {
      await pg.none(`update users set name = $1 where id = $2`, [name, userId])
    }
    if (username) {
      await pg.none(`update users set username = $1 where id = $2`, [
        username,
        userId,
      ])
    }
    if (avatarUrl) {
      await updateUser(pg, userId, { avatarUrl })
    }

    broadcastUpdatedUser(
      removeUndefinedProps({ id: userId, name, username, avatarUrl })
    )
    await updateUserDenormalizedFields(userId, { name, username, avatarUrl })
  }

  if (isAdminUpdate) {
    trackAuditEvent(auth.uid, 'admin update user', undefined, undefined, {
      userId: userId,
      updates: update,
    })
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
  const pg = createSupabaseDirectClient()

  log('Updating denormalized user data on contracts...')

  const contractUpdate: Partial<Contract> = removeUndefinedProps({
    creatorName: update.name,
    creatorUsername: update.username,
    creatorAvatarUrl: update.avatarUrl,
  })

  const contractIds = await pg.map(
    `update contracts set data = data || $1 where creator_id = $2 returning id`,
    [JSON.stringify(contractUpdate), userId],
    (row) => row.id
  )
  log(`Updated ${contractIds} contracts.`)

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

  const postUpdate: Partial<TopLevelPost> = removeUndefinedProps({
    creatorName: update.name,
    creatorUsername: update.username,
    creatorAvatarUrl: update.avatarUrl,
  })

  const postIds = await pg.map(
    `update old_posts
     set data = data || $2
     where creator_id = $1
     returning id`,
    [userId, JSON.stringify(postUpdate)],
    (row) => row.id
  )
  log(`Updated ${postIds.length} posts.`)

  log('Done denormalizing!')
}
