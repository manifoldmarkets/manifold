import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { getPrivateUser, getUserSupabase } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { filterDefined } from 'common/util/array'
import { uniq } from 'lodash'

// we need to pass all the userids in, find the channel where all userids are present,
// return the channel if not created
// then we need a leave-channel endpoint that

const postSchema = z
  .object({
    userIds: z.array(z.string()),
  })
  .strict()

export const createprivateusermessagechannel = authEndpoint(
  async (req, auth) => {
    const { userIds: passedUserIds } = validate(postSchema, req.body)
    const userIds = uniq(passedUserIds)
    const pg = createSupabaseDirectClient()
    const creator = await getUserSupabase(auth.uid)
    if (!creator) throw new APIError(401, 'Your account was not found')
    if (creator.isBannedFromPosting) throw new APIError(403, 'You are banned')
    const toPrivateUsers = filterDefined(
      await Promise.all(userIds.map((id) => getPrivateUser(id)))
    )

    if (toPrivateUsers.length !== userIds.length)
      throw new APIError(
        404,
        `Private user ${userIds.find(
          (uid) => !toPrivateUsers.map((p) => p.id).includes(uid)
        )} not found`
      )
    // TODO: should check if any user has blocked any other user in the list
    if (toPrivateUsers.some((p) => p.blockedUserIds.includes(auth.uid)))
      throw new APIError(403, 'You are blocked by one of those users')

    const allUserIds = uniq([auth.uid, ...userIds])
    const currentChannel = await pg.oneOrNone(
      `
        select channel_id from private_user_message_channel_members
         where user_id = any($1)
         group by channel_id
         having count(distinct user_id) = $2
      `,
      [allUserIds, allUserIds.length]
    )
    if (currentChannel)
      return {
        status: 'success',
        channelId: Number(currentChannel.channel_id),
      }

    const channel = await pg.one(
      `insert into private_user_message_channels default values returning id`,
      []
    )
    await pg.none(
      `insert into private_user_message_channel_members (channel_id, user_id, role, status)
                values 
                ($1, $2, 'creator', 'joined')
             `,
      [channel.id, auth.uid]
    )
    await Promise.all(
      userIds.map((id) =>
        pg.none(
          `insert into private_user_message_channel_members (channel_id, user_id, role, status)
                values
                ($1, $2, 'member', 'proposed')
              `,
          [channel.id, id]
        )
      )
    )

    return { status: 'success', channelId: Number(channel.id) }
  }
)
