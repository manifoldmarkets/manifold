/**
 * A condition on the users row `u` that keeps off a leaderboard the users who
 * don't belong on it: deleted accounts and the legacy full ban
 * (isBannedFromPosting) leave every board, and an active ban of a type in
 * `banTypes` leaves this one. `banTypes` is the placeholder the caller binds
 * to getBanTypesForLeaderboard(kind), like '$<banTypes>' or '$5'. Lifted and
 * expired bans don't count.
 */
export const leaderboardUserFilter = (banTypes: string) => `
  coalesce((u.data->>'userDeleted')::boolean, false) is not true
  and coalesce((u.data->>'isBannedFromPosting')::boolean, false) is not true
  and not exists (
    select 1 from user_bans ub
    where ub.user_id = u.id
      and ub.ban_type = any(${banTypes}::text[])
      and ub.ended_at is null
      and (ub.end_time is null or ub.end_time > now())
  )`
