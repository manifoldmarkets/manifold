drop table if exists temp_users;

create table temp_users as
SELECT 
  u.id,
  u.username,
  u.name,
  u.created_time,

  -- select some keys from user data
  u.data - array(select jsonb_object_keys(u.data
    - 'avatarUrl'
    - 'isBannedFromPosting'
    - 'userDeleted'
    - 'bio'
    - 'website'
    - 'twitterHandle'
    - 'discordHandle'
    - 'fromLove'
    - 'sweepstakesVerified'
    - 'verifiedPhone'
    - 'idVerified'
  )) as user_data,

  -- select some keys from private user data
  pu.data - array(select jsonb_object_keys(pu.data
    - 'email'
    - 'initialDeviceToken'
    - 'initialIpAddress'
    - 'notificationPreferences'
    - 'blockedUserIds'
    - 'blockedByUserIds'
  )) as private_user_data
FROM lovers l
JOIN users u ON u.id = l.user_id
LEFT JOIN private_users pu ON u.id = pu.id;

alter table temp_users enable row level security;

drop table if exists temp_love_messages;

create table temp_love_messages as
with love_channels as (
  select mc.*
  from private_user_message_channels mc
  where not exists (
    -- Check if any member is NOT a love user
    select user_id from private_user_message_channel_members mcm
      where mc.id = mcm.channel_id
    except
    select user_id from lovers
  )
)
select 
  pum.*
from love_channels lc
left join private_user_messages pum
on pum.channel_id = lc.id;

alter table temp_love_messages enable row level security;
