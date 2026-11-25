// Shared by live trophy stats and nightly ranks. The users row is aliased as person.
// Rank exclusions apply only to holders, so they are checked separately.
export const TROPHY_PERSON_FILTER = `not person.is_bot
  and not coalesce((person.data->>'userDeleted')::boolean, false)
  and not exists (
    select 1 from user_bans b
    where b.user_id = person.id and b.ended_at is null
      and (b.end_time is null or b.end_time > now()) and b.ban_type <> 'modAlert'
  )`

// A reaction on an old post comment has no contract_comments row.
export const TROPHY_VISIBLE_COMMENT_FILTER = `not exists (
    select 1 from contract_comments cc where cc.comment_id = r.content_id
      and (coalesce((cc.data->>'deleted')::boolean, false)
        or coalesce((cc.data->>'hidden')::boolean, false))
  )`
