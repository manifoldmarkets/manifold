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
      ts <= $3::timestamptz - interval '7 days' as mature
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
      true as signed_up
    from
      signup_accounts
    group by
      browser_id
  ),
  trade_outcomes as (
    select
      a.browser_id,
      true as signed_up_and_traded
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
