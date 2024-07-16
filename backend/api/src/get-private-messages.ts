import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { PrivateMessageChannel } from 'common/supabase/private-messages'
import { Row } from 'common/supabase/utils'
import { groupBy, mapValues } from 'lodash'

export const getChannelMemberships: APIHandler<
  'get-channel-memberships'
> = async (props, auth) => {
  const pg = createSupabaseDirectClient()
  const { channelId, lastUpdatedTime, createdTime, limit } = props

  let channels: PrivateMessageChannel[]
  const convertRow = (r: any) => ({
    channel_id: r.channel_id as number,
    notify_after_time: r.notify_after_time as string,
    created_time: r.created_time as string,
    last_updated_time: r.last_updated_time as string,
  })

  if (channelId) {
    channels = await pg.map(
      `select channel_id, notify_after_time, pumcm.created_time, last_updated_time
       from private_user_message_channel_members pumcm
       join private_user_message_channels pumc on pumc.id= pumcm.channel_id
       where user_id = $1
       and channel_id = $2
       limit $3
       `,
      [auth.uid, channelId, limit],
      convertRow
    )
  } else {
    channels = await pg.map(
      `with latest_channels as (
         select distinct on (pumc.id) pumc.id as channel_id, notify_after_time, pumc.created_time, pumc.last_updated_time
         from private_user_message_channels pumc
         join private_user_message_channel_members pumcm on pumcm.channel_id = pumc.id
         inner join private_user_messages pum on pumc.id = pum.channel_id
             and (pum.visibility != 'introduction' or pum.user_id != $1)
         where pumcm.user_id = $1
         and not status = 'left'
         and ($2 is null or pumcm.created_time > $2)
         and ($4 is null or pumc.last_updated_time > $4)
         order by pumc.id, pumc.last_updated_time desc
       )
       select * from latest_channels
       order by last_updated_time desc
       limit $3
       `,
      [auth.uid, createdTime ?? null, limit, lastUpdatedTime ?? null],
      convertRow
    )
  }
  if (!channels || channels.length === 0)
    return { channels: [], memberIdsByChannelId: {} }
  const channelIds = channels.map((c) => c.channel_id)

  const members = await pg.map(
    `select channel_id, user_id
     from private_user_message_channel_members
     where not user_id = $1
     and channel_id in ($2:list)
     and not status = 'left'
     `,
    [auth.uid, channelIds],
    (r) => ({
      channel_id: r.channel_id as number,
      user_id: r.user_id as string,
    })
  )

  const memberIdsByChannelId = mapValues(
    groupBy(members, 'channel_id'),
    (members) => members.map((m) => m.user_id)
  )

  return {
    channels,
    memberIdsByChannelId,
  }
}

export const getChannelMessages: APIHandler<'get-channel-messages'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const { channelId, limit, id } = props
  return await pg.map(
    `select * 
       from private_user_messages
       where channel_id = $1
       and exists (select 1 from private_user_message_channel_members pumcm
                         where pumcm.user_id = $2
                         and pumcm.channel_id = $1
                        )
       and ($4 is null or id > $4)
       and not visibility = 'system_status' 
       order by created_time desc
       limit $3
      `,
    [channelId, auth.uid, limit, id],
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
