create or replace function get_non_empty_private_message_channel_ids(p_user_id text, p_ignored_statuses text[], p_limit integer)
    returns setof private_user_message_channels as $$
select distinct pumc.*
from private_user_message_channels pumc
     join private_user_message_channel_members pumcm on pumcm.channel_id = pumc.id
     left join private_user_messages pum on pumc.id = pum.channel_id
     and (pum.visibility != 'introduction' or pum.user_id != p_user_id)
where pumcm.user_id = p_user_id
  and pumcm.status not in (select unnest(p_ignored_statuses))
  and pum.id is not null
order by pumc.last_updated_time desc
limit p_limit;
$$ language sql;