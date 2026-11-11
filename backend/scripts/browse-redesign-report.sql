-- Parameters: cohort start, exclusive end, as-of, exposure name, toggle name,
-- experiment id, experiment launch. Always scan from launch to establish the
-- true first exposure, even when reporting a later enrollment window.
with
  events as materialized (
    select
      id,
      ts,
      name,
      data,
      data ->> 'browserId' as browser_id
    from
      user_events
    where
      ts >= $7::timestamptz
      and ts < $3::timestamptz
      and name in ($4, $5)
      and data ->> 'experiment' = $6
      and data ->> 'environment' = 'production'
      and nullif(data ->> 'browserId', '') is not null
  ),
  first_exposures as (
    select distinct
      on (browser_id) *
    from
      events
    where
      name = $4
    order by
      browser_id,
      ts,
      id
  ),
  entrants as materialized (
    select
      *,
      ts <= $3::timestamptz - interval '7 days' as mature,
      -- The one-day outcomes can be read a week before the seven-day ones.
      ts <= $3::timestamptz - interval '1 day' as mature_day
    from
      first_exposures
    where
      ts >= $1::timestamptz
      and ts < $2::timestamptz
  ),
  event_outcomes as (
    select
      e.browser_id,
      bool_or(
        later.name = $4
        and later.ts >= e.ts + interval '1 day'
        and later.ts < e.ts + interval '7 days'
      ) as returned,
      bool_or(
        later.name = $5
        and later.ts < e.ts + interval '7 days'
        and later.data ->> 'view' = 'new'
      ) as chose_new,
      bool_or(
        later.name = $5
        and later.ts < e.ts + interval '7 days'
        and later.data ->> 'view' = 'legacy'
      ) as chose_classic,
      bool_or(
        later.ts < e.ts + interval '7 days'
        and later.data ->> 'existingUser' = 'true'
      ) as encountered_existing_account,
      bool_or(
        later.name = $4
        and (
          later.data ->> 'variant' is distinct from e.data ->> 'variant'
          or later.data ->> 'cohort' is distinct from e.data ->> 'cohort'
        )
      ) as conflicting_assignment
    from
      entrants e
      join events later on later.browser_id = e.browser_id
      and later.ts >= e.ts
    group by
      e.browser_id
  ),
  browser_tokens as (
    -- Analytics' deviceId continues to rotate on logout. Only the separate
    -- browserId is stable. Link signup to any token observed in this follow-up.
    select distinct
      e.browser_id,
      e.ts,
      later.data ->> 'deviceId' as device_id
    from
      entrants e
      join events later on later.browser_id = e.browser_id
      and later.ts >= e.ts
      and later.ts < e.ts + interval '7 days'
    where
      nullif(later.data ->> 'deviceId', '') is not null
  ),
  new_accounts as materialized (
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
        $2::timestamptz + interval '7 days',
        $3::timestamptz
      )
  ),
  signup_accounts as materialized (
    select distinct
      t.browser_id,
      t.ts,
      u.id,
      u.created_time
    from
      browser_tokens t
      join new_accounts u on u.device_id = t.device_id
      and u.created_time >= t.ts
      and u.created_time < t.ts + interval '7 days'
  ),
  signup_outcomes as (
    select
      browser_id,
      true as signed_up,
      bool_or(created_time < ts + interval '1 day') as signed_up_day
    from
      signup_accounts
    group by
      browser_id
  ),
  trade_outcomes as (
    select
      a.browser_id,
      true as signed_up_and_traded,
      -- A resting limit order keeps its creation time while it fills, so for
      -- the one-day outcome a bet counts from its first fill that moved
      -- money, and never from before it was placed. A row with no fill
      -- history counts from when it was placed. A row whose history holds no
      -- usable fill does not count. Every value is checked before it is
      -- cast, so one odd row cannot stop the report.
      bool_or(
        case
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
            a.ts + interval '1 day'
        ) * 1000
      ) as traded_day
    from
      signup_accounts a
      join contract_bets b on b.user_id = a.id
      and b.created_time >= a.created_time
      and b.created_time < a.ts + interval '7 days'
    where
      b.created_time >= $1::timestamptz
      and b.created_time < least(
        $2::timestamptz + interval '7 days',
        $3::timestamptz
      )
      and b.amount > 0
      and b.shares > 0
      and coalesce(b.is_api, false) = false
      and coalesce(b.is_redemption, false) = false
    group by
      a.browser_id
  )
select
  e.data ->> 'cohort' as cohort,
  coalesce(e.data ->> 'variant', 'not-randomized') as variant,
  e.data ->> 'signedInAtEnrollment' as signed_in_at_entry,
  e.data ->> 'mobile' as mobile_at_entry,
  count(*)::int as browsers,
  count(*) filter (
    where
      mature
  )::int as mature_browsers,
  count(*) filter (
    where
      mature
      and returned
  )::int as returned_days_1_to_7,
  count(*) filter (
    where
      mature
      and signed_up
  )::int as signups_7d,
  count(*) filter (
    where
      mature
      and signed_up_and_traded
  )::int as activated_7d,
  count(*) filter (
    where
      mature_day
  )::int as mature_day_browsers,
  count(*) filter (
    where
      mature_day
      and signed_up_day
  )::int as signups_1d,
  count(*) filter (
    where
      mature_day
      and signed_up_day
      and traded_day
  )::int as activated_1d,
  count(*) filter (
    where
      mature
      and chose_new
  )::int as chose_new_7d,
  count(*) filter (
    where
      mature
      and chose_classic
  )::int as chose_classic_7d,
  count(*) filter (
    where
      mature
      and encountered_existing_account
  )::int as existing_account_7d,
  count(*) filter (
    where
      conflicting_assignment
  )::int as assignment_conflicts
from
  entrants e
  left join event_outcomes ev using (browser_id)
  left join signup_outcomes s using (browser_id)
  left join trade_outcomes t using (browser_id)
group by
  1,
  2,
  3,
  4
order by
  1,
  2,
  3,
  4;
