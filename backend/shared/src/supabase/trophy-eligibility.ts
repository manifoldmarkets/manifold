import { NET_WORTH_SNAPSHOT_MAX_AGE_HOURS } from 'common/trophies'

// Floor the sum in Postgres before a numeric can round up in JavaScript.
export const TROPHY_SNAPSHOT_NET_WORTH = `floor(uphl.balance + uphl.investment_value)`

export const TROPHY_FRESH_PORTFOLIO_FILTER = `uphl.last_calculated between
  now() - make_interval(hours => ${NET_WORTH_SNAPSHOT_MAX_AGE_HOURS}) and now()`

// Shared by live trophy stats and nightly ranks. The users row is aliased as person.
// Rank exclusions apply only to holders, so they are checked separately.
export const TROPHY_PERSON_FILTER = `not person.is_bot
  and person.id <> all($[bannedTradingIds]::text[])
  and not coalesce((person.data->>'userDeleted')::boolean, false)
  and not exists (
    select 1 from user_bans b
    where b.user_id = person.id and b.ended_at is null
      and (b.end_time is null or b.end_time > now()) and b.ban_type <> 'modAlert'
  )`

// Check visibility once per (author, comment), even for heavily liked comments.
export const trophyLikedCommentsQuery = (scope: 'user' | 'all') => `
  with liked_ids as materialized (
    select distinct r.content_owner_id, r.content_id
    from user_reactions r
    join users person on person.id = r.user_id
    where r.content_type = 'comment' and r.reaction_type = 'like'
      ${scope === 'user' ? 'and r.content_owner_id = $[userId]' : ''}
      and r.user_id <> r.content_owner_id and ${TROPHY_PERSON_FILTER}
  )
  select r.content_owner_id as user_id, count(*) as value
  from liked_ids r
  where exists (
    select 1 from contract_comments cc
    join contracts c on c.id = cc.contract_id
    where cc.comment_id = r.content_id and cc.user_id = r.content_owner_id
      and not coalesce(c.deleted, false)
      and not coalesce((cc.data->>'deleted')::boolean, false)
      and not coalesce((cc.data->>'hidden')::boolean, false)
  ) or exists (
    select 1 from old_post_comments pc
    join old_posts p on p.id = pc.post_id
    where pc.user_id = r.content_owner_id and pc.comment_id = r.content_id
      and not coalesce((pc.data->>'deleted')::boolean, false)
      and not coalesce((pc.data->>'hidden')::boolean, false)
  )
  group by r.content_owner_id`

export const TROPHY_NET_WORTH_PEAK_CONFLICT = `on conflict (user_id) do update set
  peak_net_worth = excluded.peak_net_worth, peak_time = excluded.peak_time
  where excluded.peak_net_worth > user_net_worth_peaks.peak_net_worth`
