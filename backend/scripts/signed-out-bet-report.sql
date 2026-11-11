-- Parameters: cohort start, exclusive end, as-of, exposure event name,
-- sign-in event name.
--
-- A device enters once, by its enrollment: its earliest exposure stored
-- within an hour of the first press its browser recorded (firstPressTime,
-- set once and sent on every exposure). A device that comes back days later
-- still reports that first press, so it cannot enroll again. The exposures
-- that qualify fall within two hours of each other, so reading two hours
-- before the window always finds the earliest. That makes the enrollment
-- the same event in every report, whatever window is asked for. Everything
-- else is counted from the device's own enrollment, so reports over
-- adjacent windows add up to the report over both.
--
-- Only the cohort window, the two hours before it and the day after it are
-- scanned, however long the test has been running.
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
      ts >= $1::timestamptz - interval '2 hours'
      and ts < least(
        $2::timestamptz + interval '1 day',
        $3::timestamptz
      )
      and name in ($4, $5)
      and data ->> 'environment' = 'production'
      and nullif(data ->> 'deviceId', '') is not null
  ),
  enrollments as (
    select distinct
      on (device_id) *
    from
      events
    where
      name = $4
      -- Stored within an hour of the first press it reports, by either
      -- clock. A later visit, or a browser whose clock is far out, does not
      -- enroll. Anyone can write an event, so the value is checked before
      -- it is cast.
      and case
        when jsonb_typeof(data -> 'firstPressTime') = 'number' then abs(
          extract(
            epoch
            from
              ts
          ) * 1000 - (data ->> 'firstPressTime')::numeric
        ) <= 3600000
        else false
      end
    order by
      device_id,
      ts,
      id
  ),
  entrants as materialized (
    select
      e.*,
      e.ts <= $3::timestamptz - interval '1 hour' as mature_hour,
      e.ts <= $3::timestamptz - interval '1 day' as mature_day
    from
      enrollments e
    where
      e.ts >= $1::timestamptz
      and e.ts < $2::timestamptz
      -- A QA override taints the whole device, not just the forced presses:
      -- it may already have an ordinary exposure in the other variant. It
      -- matters from just before the enrollment to the end of the day its
      -- outcomes are measured over.
      and not exists (
        select
        from
          events f
        where
          f.device_id = e.device_id
          and f.data ->> 'forced' = 'true'
          and f.ts >= e.ts - interval '2 hours'
          and f.ts < e.ts + interval '1 day'
      )
  ),
  event_outcomes as (
    select
      e.device_id,
      -- Logged when the sign-in window's promise settles, not when it opens.
      bool_or(
        later.name = $5
        and later.ts < e.ts + interval '1 hour'
      ) as sign_in_settled,
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
      and later.ts < e.ts + interval '1 day'
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
      -- A resting limit order keeps its creation time while it fills, so it
      -- counts from its first fill, not from when it was placed.
      and coalesce(
        (
          select
            min((fill ->> 'timestamp')::numeric)
          from
            jsonb_array_elements(
              case
                when jsonb_typeof(b.data -> 'fills') = 'array' then b.data -> 'fills'
                else '[]'::jsonb
              end
            ) fill
          where
            (fill ->> 'amount')::numeric > 0
        ),
        extract(
          epoch
          from
            b.created_time
        ) * 1000
      ) < extract(
        epoch
        from
          a.ts + interval '1 day'
      ) * 1000
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
      and sign_in_settled
  )::int as sign_in_settled_1h,
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
