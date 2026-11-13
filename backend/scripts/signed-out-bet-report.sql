-- Parameters: cohort start, exclusive end, as-of, exposure event name,
-- sign-in event name.
--
-- Every exposure says how long ago its device first pressed a signed-out bet
-- button (sinceFirstPressMs) and on which surface (firstSurface). One sent
-- within an hour of that first press can enroll the device. The device
-- enrolls by its earliest such exposure, at the moment that exposure says the
-- press happened: its stored time less the elapsed time. Elapsed time is not
-- a clock reading, so a wrong browser clock makes no difference, and an
-- exposure that arrives late still places the device at its press.
--
-- Everything else is counted from the device's own enrollment, never from
-- the edges of the scan: the window it falls in, its outcomes, the QA
-- exclusion and the conflict flag. So reports over adjacent windows add up
-- to the report over both, and a long test can be read a day at a time.
--
-- Only the cohort window, the hour before it and the day after it are
-- scanned, however long the test has been running. The hour before is for
-- the rare device with two records of its first press, written by two tabs
-- at once: its earliest exposure decides, and may sit just before a window
-- that its other one falls in.
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
      ts >= $1::timestamptz - interval '1 hour'
      and ts < least(
        $2::timestamptz + interval '1 day',
        $3::timestamptz
      )
      and name in ($4, $5)
      and data ->> 'environment' = 'production'
      and nullif(data ->> 'deviceId', '') is not null
  ),
  exposures as (
    select
      *,
      -- Anyone can write an event, so the value is checked before it is cast.
      case
        when jsonb_typeof(data -> 'sinceFirstPressMs') = 'number' then (data ->> 'sinceFirstPressMs')::numeric
      end as since_first_press_ms
    from
      events
    where
      name = $4
  ),
  enrollments as (
    select distinct
      on (device_id) *,
      ts - since_first_press_ms * interval '1 millisecond' as enrolled_at
    from
      exposures
    where
      since_first_press_ms >= 0
      and since_first_press_ms <= 3600000
      and data ->> 'firstSurface' in ('ticket', 'button')
    order by
      device_id,
      ts,
      id
  ),
  entrants as materialized (
    select
      e.*,
      e.enrolled_at <= $3::timestamptz - interval '1 hour' as mature_hour,
      e.enrolled_at <= $3::timestamptz - interval '1 day' as mature_day
    from
      enrollments e
    where
      e.enrolled_at >= $1::timestamptz
      and e.enrolled_at < $2::timestamptz
      -- A QA override taints the whole device, not just the forced presses:
      -- it may already have an ordinary exposure in the other variant. A
      -- device that has used it says so on every exposure from then on, the
      -- one it enrolls by included. What matters is the day its outcomes are
      -- measured over. The hour before allows for an exposure that took
      -- longer to arrive than a forced event sent just after it.
      and not exists (
        select
        from
          events f
        where
          f.device_id = e.device_id
          and f.data ->> 'forced' = 'true'
          and f.ts >= e.enrolled_at - interval '1 hour'
          and f.ts < e.enrolled_at + interval '1 day'
      )
  ),
  event_outcomes as (
    select
      e.device_id,
      -- Logged when the sign-in window's promise settles, not when it opens.
      bool_or(
        later.name = $5
        and later.ts < e.enrolled_at + interval '1 hour'
      ) as sign_in_settled,
      bool_or(
        later.name = $5
        and later.ts < e.enrolled_at + interval '1 hour'
        and later.data ->> 'result' = 'signed-in'
      ) as sign_in_completed,
      bool_or(
        later.name = $4
        and later.data ->> 'variant' is distinct from e.data ->> 'variant'
      ) as conflicting_assignment
    from
      entrants e
      join events later on later.device_id = e.device_id
      and later.ts >= e.enrolled_at
      and later.ts < e.enrolled_at + interval '1 day'
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
      e.enrolled_at,
      u.id,
      u.created_time
    from
      entrants e
      join new_accounts u on u.device_id = e.device_id
      and u.created_time >= e.enrolled_at
      and u.created_time < e.enrolled_at + interval '1 hour'
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
      and b.created_time < a.enrolled_at + interval '1 day'
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
      -- A resting limit order keeps its creation time while it fills, so a
      -- bet counts from its first fill that moved money, and never from
      -- before it was placed. A row with no fill history counts from when it
      -- was placed. A row whose history holds no usable fill does not count.
      -- Every value is checked before it is cast, so one odd row cannot stop
      -- the report.
      and case
        when jsonb_typeof(b.data -> 'fills') = 'array' then case
          when jsonb_array_length(b.data -> 'fills') = 0 then extract(
            epoch
            from
              b.created_time
          ) * 1000
          else (
            select
              case
                when min(filled.filled_ms) is null then null
                else greatest(
                  min(filled.filled_ms),
                  extract(
                    epoch
                    from
                      b.created_time
                  ) * 1000
                )
              end
            from
              (
                select
                  case
                    when jsonb_typeof(fill -> 'timestamp') = 'number' then (fill ->> 'timestamp')::numeric
                  end as filled_ms,
                  case
                    when jsonb_typeof(fill -> 'amount') = 'number' then (fill ->> 'amount')::numeric
                  end as amount
                from
                  jsonb_array_elements(b.data -> 'fills') fill
              ) filled
            where
              filled.amount > 0
          )
        end
        else extract(
          epoch
          from
            b.created_time
        ) * 1000
      end < extract(
        epoch
        from
          a.enrolled_at + interval '1 day'
      ) * 1000
    group by
      a.device_id
  )
select
  e.data ->> 'variant' as variant,
  -- Where the device first pressed: 'ticket' is a market page, where the
  -- variants differ in whether sign-in opens; 'button' is a list row or card,
  -- where they differ only in whether the bet reopens afterwards.
  e.data ->> 'firstSurface' as first_surface,
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
