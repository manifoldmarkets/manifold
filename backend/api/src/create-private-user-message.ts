import { MAX_COMMENT_JSON_LENGTH } from 'api/create-comment'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { contentSchema } from 'common/api/zod-types'
import { isAdminId } from 'common/envs/constants'
import { isUserBanned } from 'common/ban-utils'
import { canReceiveBonuses } from 'common/user'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createPrivateUserMessageMain } from 'shared/supabase/private-messages'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { getActiveUserBans } from './helpers/rate-limit'

const postSchema = z
  .object({
    content: contentSchema,
    channelId: z.number().gte(0).int(),
  })
  .strict()

export const createprivateusermessage = authEndpoint(async (req, auth) => {
  const { content, channelId } = validate(postSchema, req.body)
  if (JSON.stringify(content).length > MAX_COMMENT_JSON_LENGTH) {
    throw new APIError(
      400,
      `Message JSON should be less than ${MAX_COMMENT_JSON_LENGTH}`
    )
  }
  const pg = createSupabaseDirectClient()
  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.userDeleted)
    throw new APIError(403, 'Your account has been deleted')

  // Check if user is banned from posting (legacy or granular)
  const creatorBans = await getActiveUserBans(creator.id)
  const isBannedFromPosting =
    creator.isBannedFromPosting || isUserBanned(creatorBans, 'posting')

  // Get other members for admin check (used by both ban and eligibility checks)
  const otherMemberIds = await pg.map<string>(
    `select user_id from private_user_message_channel_members
     where channel_id = $1 and user_id != $2`,
    [channelId, creator.id],
    (r) => r.user_id
  )

  const allRecipientsAreAdmins =
    otherMemberIds.length > 0 && otherMemberIds.every((id) => isAdminId(id))

  if (isBannedFromPosting) {
    // Banned users can still message admins
    if (!allRecipientsAreAdmins) {
      throw new APIError(
        403,
        'You are banned from messaging. You can still message Manifold staff for support.'
      )
    }
  }

  // Check if user is bonus-ineligible (not verified or grandfathered)
  if (!canReceiveBonuses(creator) && !allRecipientsAreAdmins) {
    throw new APIError(
      403,
      'Please verify your identity to send messages. You can still message Manifold staff for support.'
    )
  }

  return await createPrivateUserMessageMain(
    creator,
    channelId,
    content,
    pg,
    'private'
  )
})
