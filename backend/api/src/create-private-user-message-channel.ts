import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { getUserSupabase } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const postSchema = z.object({
  userId: z.string(),
})

export const createprivateusermessagechannel = authEndpoint(
  async (req, auth) => {
    const { userId } = validate(postSchema, req.body)

    const pg = createSupabaseDirectClient()
    const creator = await getUserSupabase(auth.uid)
    if (!creator) throw new APIError(401, 'Your account was not found')
    if (creator.isBannedFromPosting) throw new APIError(403, 'You are banned')

    // For now, we'll stick with one message channel per user pair
    const currentChannel = await pg.oneOrNone(
      `with user_1_channel_memberships as (select channel_id from private_user_message_channel_members where user_id = $1),
                user_2_channel_memberships as (select channel_id from private_user_message_channel_members where user_id = $2),
                shared_memberships as (select * from user_1_channel_memberships intersect select * from user_2_channel_memberships)
                select channel_id from shared_memberships
                `,
      [auth.uid, userId]
    )
    if (currentChannel)
      return {
        status: 'success',
        channelId: Number(currentChannel.channel_id),
      }

    const channel = await pg.one(
      `insert into private_user_message_channels default values returning id
`,
      []
    )
    await pg.none(
      `insert into private_user_message_channel_members (channel_id, user_id, role, status)
                values 
                ($1, $2, 'creator', 'joined'),
                ($1, $3, 'member', 'proposed')
             `,
      [channel.id, auth.uid, userId]
    )

    return { status: 'success', channelId: Number(channel.id) }
  }
)
