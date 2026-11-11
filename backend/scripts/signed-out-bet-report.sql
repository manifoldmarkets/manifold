-- Parameters: cohort start, exclusive end, as-of, exposure event name,
-- sign-in event name, experiment launch. Always scan from launch to find each
-- device's true first exposure, even when reporting a later window.
with
  events as materialized (
    select
      id,
      ts,
      name,
      data,
      data ->> 'deviceId' as device_id
    from
      user_events
    where
      ts >= $6::timestamptz
      and ts < $3::timestamptz
      and name in ($4, $5)
      and data ->> 'environment' = 'production'
      -- QA overrides are never part of the estimate.
      and coalesce(data ->> 'forced', 'false') = 'false'
      and nullif(data ->> 'deviceId', '') is not null
  ),
  first_exposures as (
    select distinct
      on (device_id) *
    from
      events
    where
      name = $4
    order by
      device_id,
      ts,
      id
  ),
  entrants as materialized (
    select
      *,
      ts <= $3::timestamptz - interval '1 hour' as mature_hour,
      ts <= $3::timestamptz - interval '1 day' as mature_day
    from
      first_exposures
    where
      ts >= $1::timestamptz
      and ts < $2::timestamptz
  ),
  event_outcomes as (
    select
      e.device_id,
      bool_or(
        later.name = $5
        and later.ts < e.ts + interval '1 hour'
      ) as sign_in_opened,
      bool_or(
        later.name = $5
        and later.ts < e.ts + interval '1 hour'
        and later.data ->> 'result' = 'signed-in'
      ) as sign_in_completed,
      bool_or(
        later.name = $4
        and later.data ->> 'variant' is distinct from e.data ->> 'variant'
      ) as conflicting_assignment
    from
      entrants e
      join events later on later.device_id = e.device_id
      and later.ts >= e.ts
    group by
      e.device_id
  ),
  new_accounts as materialized (
    -- Signup records the device token it happened on. One Tap, the sidebar
    -- button and the bet buttons all count: the question is whether the
    -- visitor ended up with an account, not which button made it.
    select
      u.id,
      u.created_time,
      p.data ->> 'initialDeviceToken' as device_id
    from
      users u
      join private_users p on p.id = u.id
    where
      u.created_time >= $1::timestamptz
      and u.created_time < least(
        $2::timestamptz + interval '1 hour',
        $3::timestamptz
      )
  ),
  signup_accounts as materialized (
    select distinct
      e.device_id,
      e.ts,
      u.id,
      u.created_time
    from
      entrants e
      join new_accounts u on u.device_id = e.device_id
      and u.created_time >= e.ts
      and u.created_time < e.ts + interval '1 hour'
  ),
  signup_outcomes as (
    select
      device_id,
      true as signed_up
    from
      signup_accounts
    group by
      device_id
  ),
  trade_outcomes as (
    select
      a.device_id,
      true as signed_up_and_traded
    from
      signup_accounts a
      join contract_bets b on b.user_id = a.id
      and b.created_time >= a.created_time
      and b.created_time < a.ts + interval '1 day'
    where
      b.created_time >= $1::timestamptz
      and b.created_time < least(
        $2::timestamptz + interval '1 day',
        $3::timestamptz
      )
      and b.amount > 0
      and b.shares > 0
      and coalesce(b.is_api, false) = false
      and coalesce(b.is_redemption, false) = false
    group by
      a.device_id
  )
select
  e.data ->> 'variant' as variant,
  -- Where the first press happened: 'ticket' is a market page, where the
  -- variants differ in whether sign-in opens; 'button' is a list row or card,
  -- where they differ only in whether the bet reopens afterwards.
  e.data ->> 'surface' as first_surface,
  count(*)::int as devices,
  count(*) filter (
    where
      mature_hour
  )::int as mature_hour_devices,
  count(*) filter (
    where
      mature_hour
      and sign_in_opened
  )::int as sign_in_opened_1h,
  count(*) filter (
    where
      mature_hour
      and sign_in_completed
  )::int as sign_in_completed_1h,
  count(*) filter (
    where
      mature_hour
      and signed_up
  )::int as signups_1h,
  count(*) filter (
    where
      mature_day
  )::int as mature_day_devices,
  count(*) filter (
    where
      mature_day
      and signed_up_and_traded
  )::int as activated_1d,
  count(*) filter (
    where
      conflicting_assignment
  )::int as assignment_conflicts
from
  entrants e
  left join event_outcomes ev using (device_id)
  left join signup_outcomes s using (device_id)
  left join trade_outcomes t using (device_id)
group by
  1,
  2
order by
  1,
  2;
