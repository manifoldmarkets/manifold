import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { uniq } from 'lodash'
import { createPrivateUserMessageChannelMain } from 'shared/supabase/private-message-channels'
import { isAdminId } from 'common/envs/constants'
import { isUserBanned } from 'common/ban-utils'
import { getUser } from 'shared/utils'

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
    const isBannedFromPosting =
      creator.isBannedFromPosting || isUserBanned(creator, 'posting')

    if (isBannedFromPosting) {
      // Banned users can only create channels with admins
      const otherUserIds = userIds.filter((id) => id !== auth.uid)
      const allRecipientsAreAdmins =
        otherUserIds.length > 0 && otherUserIds.every((id) => isAdminId(id))

      if (!allRecipientsAreAdmins) {
        throw new APIError(
          403,
          'You are banned from messaging. You can still message Manifold staff for support.'
        )
      }
    }

    return await createPrivateUserMessageChannelMain(
      auth.uid,
      userIds,
      createSupabaseDirectClient()
    )
  }
)
