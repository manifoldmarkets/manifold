import { runScript } from 'run-script'
import { type SupabaseDirectClient } from 'shared/supabase/init'
import * as fs from 'fs'

// get all users of manifold love but ONLY the data relevant to manifold love

runScript(({ pg }) => {
  dumpUsers(pg)
  dumpChats(pg)
})

const dumpUsers = async (pg: SupabaseDirectClient) => {
  const user_results = await pg.many(`
    SELECT 
      u.id,
      u.username,
      u.name,
      
      -- select some keys from user data
      u.data - array(select jsonb_object_keys(u.data)
        - 'isBannedFromPosting'
        - 'userDeleted'
        - 'bio'
        - 'website'
        - 'twitterHandle'
        - 'discordHandle'
        - 'fromLove'
        - 'sweestakesVerified'
        - 'verifiedPhone'
        - 'idVerified'
      ) as user_data,
      
      -- select some keys from private user data
      pu.data - array(select jsonb_object_keys(pu.data)
        - 'email'
        - 'notificationPreferences'
      ) as private_user_data
      
    FROM lovers l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN private_users pu ON u.id = pu.id
  `)

  const keys = Object.keys(user_results[0])
  const csv = user_results
    .map((row) => keys.map((k) => row.data[k]).join(','))
    .join('\n')

  fs.writeFileSync('users.csv', keys.join(',') + '\n' + csv)
}

const dumpChats = async (pg: SupabaseDirectClient) => {
  const results = await pg.many(`
    with love_channels as (
      select mc.*
      from private_user_message_channels mc
      where not exists (
        -- Check if any member is NOT a love user
        select unnest(mc.member_ids) as user_id
        except
        select user_id from lovers
      )
      and mc.member_count > 0
    )
    select 
      pum.*
    from love_channels lc
    left join private_user_messages pum
    on pum.channel_id = lc.channel_id
    order by lc.channel_id, pum.created_time
  `)

  const keys = Object.keys(results[0])
  const csv = results.map((row) => keys.map((k) => row[k]).join(',')).join('\n')

  fs.writeFileSync('chats.csv', keys.join(',') + '\n' + csv)
}
