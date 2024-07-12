import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { PrivateMessageChannel } from 'common/supabase/private-messages'
import { Row } from 'common/supabase/utils'

export const getChannelMemberships: APIHandler<
  'get-channel-memberships'
> = async (props, auth) => {
  const pg = createSupabaseDirectClient()
  const { channelId, createdTime, limit } = props
  if (channelId) {
    return await pg.map(
      `select channel_id, notify_after_time
     from private_user_message_channel_members
     where user_id = $1
     and channel_id = $2
     limit $3
     `,
      [auth.uid, channelId, limit],
      (r) =>
        ({
          channel_id: r.channel_id as number,
          notify_after_time: r.notify_after_time as string,
          created_time: r.created_time as string,
          last_updated_time: r.last_updated_time as string,
        } as PrivateMessageChannel)
    )
  }
  return await pg.map(
    `select distinct pumc.id as channel_id, notify_after_time, pumc.created_time, pumc.last_updated_time
     from private_user_message_channels pumc
     join private_user_message_channel_members pumcm on pumcm.channel_id = pumc.id
     left join private_user_messages pum on pumc.id = pum.channel_id
         and (pum.visibility != 'introduction' or pum.user_id != $1)
     where pumcm.user_id = $1
     and pum.id is not null
     and not status = 'left'
     and ($2 is null or pumcm.created_time > $2)
     order by pumc.last_updated_time desc
     limit $3
     `,
    [auth.uid, createdTime ?? null, limit],
    (r) =>
      ({
        channel_id: r.channel_id as number,
        notify_after_time: r.notify_after_time as string,
        created_time: r.created_time as string,
        last_updated_time: r.last_updated_time as string,
      } as PrivateMessageChannel)
  )
}

export const getChannelMembers: APIHandler<'get-channel-members'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const { channelIds, limit } = props
  return await pg.map(
    `select channel_id, user_id, notify_after_time
       from private_user_message_channel_members
       where not user_id = $1
       and channel_id in ($2:list)
       and not status = 'left' 
       limit $3
      `,
    [auth.uid, channelIds, limit],
    (r) => ({
      channel_id: r.channel_id as number,
      user_id: r.user_id as string,
    })
  )
}

export const getChannelMessages: APIHandler<'get-channel-messages'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const { channelId, limit, id, createdTime } = props
  return await pg.map(
    `select * 
       from private_user_messages
       where channel_id = $1
       and exists (select 1 from private_user_message_channel_members pumcm
                         where pumcm.user_id = $2
                         and pumcm.channel_id = $1
                        )
       and ($4 is null or id > $4)
       and ($5 is null or created_time > $5)
       and not visibility = 'system_status' 
       order by created_time desc
       limit $3
      `,
    [channelId, auth.uid, limit, id, createdTime],
    (r) => r as Row<'private_user_messages'>
  )
}

export const getLastSeenChannelTime: APIHandler<
  'get-channel-seen-time'
> = async (props, auth) => {
  const pg = createSupabaseDirectClient()
  const { channelId } = props
  const r = await pg.oneOrNone(
    `select created_time
       from private_user_seen_message_channels
       where channel_id = $1
       and user_id = $2
       order by created_time desc
       limit 1
      `,
    [channelId, auth.uid]
  )
  return { created_time: r ? (r.created_time as string) : '0' }
}

export const setChannelLastSeenTime: APIHandler<
  'set-channel-seen-time'
> = async (props, auth) => {
  const pg = createSupabaseDirectClient()
  const { channelId } = props
  await pg.none(
    `insert into private_user_seen_message_channels (user_id, channel_id) 
            values ($1, $2)
      `,
    [auth.uid, channelId]
  )
}
