import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { uniq } from 'lodash'
import { createPrivateUserMessageChannelMain } from 'shared/supabase/private-message-channels'
import { isAdminId } from 'common/envs/constants'
import { isUserBanned } from 'common/ban-utils'
import { canReceiveBonuses } from 'common/user'
import { getUser } from 'shared/utils'
import { getActiveUserBans } from './helpers/rate-limit'

const postSchema = z
  .object({
    userIds: z.array(z.string()),
  })
  .strict()

export const createprivateusermessagechannel = authEndpoint(
  async (req, auth) => {
    const { userIds: passedUserIds } = validate(postSchema, req.body)
    const userIds = uniq(passedUserIds.concat(auth.uid))

    const creator = await getUser(auth.uid)
    if (!creator) throw new APIError(401, 'Your account was not found')
    if (creator.userDeleted)
      throw new APIError(403, 'Your account has been deleted')

    // Check if user is banned from posting (legacy or granular)
    const creatorBans = await getActiveUserBans(creator.id)
    const isBannedFromPosting =
      creator.isBannedFromPosting || isUserBanned(creatorBans, 'posting')

    // Check if all recipients are admins (used by both ban and eligibility checks)
    const otherUserIds = userIds.filter((id) => id !== auth.uid)
    const allRecipientsAreAdmins =
      otherUserIds.length > 0 && otherUserIds.every((id) => isAdminId(id))

    if (isBannedFromPosting) {
      // Banned users can only create channels with admins
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

    return await createPrivateUserMessageChannelMain(
      auth.uid,
      userIds,
      createSupabaseDirectClient()
    )
  }
)
