import {
  BROWSE_EXPERIMENT,
  BROWSE_EXPOSURE_EVENT,
  BROWSE_TOGGLE_EVENT,
} from 'common/browse-rollout'
import { READ_ONLY_REPEATABLE_MODE } from 'shared/supabase/init'
import { runScript } from './run-script'

/**
 * Read-only, production-only scorecard. Run from backend/scripts:
 *   yarn ts-node browse-redesign-report.ts YYYY-MM-DD [YYYY-MM-DD]
 * Dates delimit FIRST exposures in UTC; the end is exclusive, defaulting to
 * now so the launch-day counts are available immediately. Outcomes mature
 * for seven days after each first exposure, regardless of the requested end.
 *
 * Unit: browser, not person. Keep original assignments, including switchers.
 * A fresh browser can belong to an existing person; account login is reported
 * diagnostically, never used to remove someone after treatment. Cross-device
 * return and cleared browser storage are not fully observable in this test.
 *
 * The primary conversion population is anonymous at enrollment. Signup links
 * use the existing initialDeviceToken captured on account creation, so signup
 * counts don't depend on visiting Browse again after registration. Trading
 * uses funded non-API buy orders placed during the follow-up window (including
 * partially filled limit orders); it is a secondary activation proxy.
 *
 * This prints counts/rates, NOT an automatic significance or shipping verdict.
 * Choose the sample size, primary metric and harm thresholds before launch.
 */
const [start, end] = process.argv.slice(2)
const asOf = new Date()
const parseDate = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : undefined
}
const from = parseDate(start)
const until = end ? parseDate(end) : asOf
if (
  !from ||
  !until ||
  until <= from ||
  until > asOf ||
  until.getTime() - from.getTime() > 90 * 86400000
) {
  throw new Error(
    'Use two UTC dates, increasing, no later than today, at most 90 days apart.'
  )
}

runScript(async ({ pg: database }) => {
  await database.tx({ mode: READ_ONLY_REPEATABLE_MODE }, async (pg) => {
    const rows = await pg.manyOrNone(
      `
      with events as materialized (
        select id, ts, user_id, name, data,
          data ->> 'deviceId' as device_id
        from user_events
        where name in ($4, $5)
          and data ->> 'experiment' = $6
          and data ->> 'environment' = 'production'
          and nullif(data ->> 'deviceId', '') is not null
          and ts < $3::timestamptz
      ), first_exposures as (
        select distinct on (device_id) * from events
        where name = $4
        order by device_id, ts, id
      ), entrants as (
        select *, ts <= $3::timestamptz - interval '7 days' as mature
        from first_exposures
        where ts >= $1::timestamptz and ts < $2::timestamptz
      ), new_accounts as materialized (
        select u.id, u.created_time, p.data ->> 'initialDeviceToken' as device_id
        from users u join private_users p on p.id = u.id
        where u.created_time >= $1::timestamptz
          and u.created_time < least($2::timestamptz + interval '7 days', $3::timestamptz)
      ), outcomes as (
        select e.*,
          exists (
            select 1 from events later
            where later.device_id = e.device_id and later.name = $4
              and later.ts >= e.ts + interval '1 day'
              and later.ts < e.ts + interval '7 days'
          ) as returned,
          exists (
            select 1 from events t
            where t.device_id = e.device_id and t.name = $5
              and t.ts >= e.ts and t.ts < e.ts + interval '7 days'
              and t.data ->> 'view' = 'new'
          ) as chose_new,
          exists (
            select 1 from events t
            where t.device_id = e.device_id and t.name = $5
              and t.ts >= e.ts and t.ts < e.ts + interval '7 days'
              and t.data ->> 'view' = 'legacy'
          ) as chose_classic,
          exists (
            select 1 from events later
            where later.device_id = e.device_id
              and later.ts >= e.ts and later.ts < e.ts + interval '7 days'
              and later.data ->> 'existingUser' = 'true'
          ) as encountered_existing_account,
          exists (
            select 1 from events later
            where later.device_id = e.device_id and later.name = $4
              and later.data ->> 'variant' is distinct from e.data ->> 'variant'
          ) as conflicting_assignment,
          exists (
            select 1 from new_accounts u
            where u.device_id = e.device_id
              and u.created_time >= e.ts
              and u.created_time < e.ts + interval '7 days'
          ) as signed_up,
          exists (
            select 1 from new_accounts u
            join contract_bets b on b.user_id = u.id
            where u.device_id = e.device_id
              and u.created_time >= e.ts
              and u.created_time < e.ts + interval '7 days'
              and b.created_time >= u.created_time
              and b.created_time < e.ts + interval '7 days'
              and b.amount > 0 and b.shares > 0
              and coalesce(b.is_api, false) = false
              and coalesce(b.is_redemption, false) = false
          ) as signed_up_and_traded
        from entrants e
      )
      select data ->> 'cohort' as cohort,
        coalesce(data ->> 'variant', 'not-randomized') as variant,
        data ->> 'signedInAtEnrollment' as signed_in_at_entry,
        data ->> 'mobile' as mobile_at_entry,
        count(*)::int as browsers,
        count(*) filter (where mature)::int as mature_browsers,
        count(*) filter (where mature and returned)::int as returned_days_1_to_7,
        count(*) filter (where mature and signed_up)::int as signups_7d,
        count(*) filter (where mature and signed_up_and_traded)::int as activated_7d,
        count(*) filter (where mature and chose_new)::int as chose_new_7d,
        count(*) filter (where mature and chose_classic)::int as chose_classic_7d,
        count(*) filter (where mature and encountered_existing_account)::int as existing_account_7d,
        count(*) filter (where conflicting_assignment)::int as assignment_conflicts
      from outcomes
      group by 1, 2, 3, 4 order by 1, 2, 3, 4
    `,
      [
        from.toISOString(),
        until.toISOString(),
        asOf.toISOString(),
        BROWSE_EXPOSURE_EVENT,
        BROWSE_TOGGLE_EVENT,
        BROWSE_EXPERIMENT,
      ]
    )

    const rate = (count: number, total: number) =>
      total ? `${((100 * count) / total).toFixed(2)}%` : 'not mature'
    console.log(
      `Production ${BROWSE_EXPERIMENT}; first exposures ${start} to ${
        end ?? asOf.toISOString()
      } UTC`
    )
    console.log(
      'Seven-day outcomes are shown only for fully matured browsers. Return means Browse/Home return.'
    )
    console.table(
      rows.map((row) => ({
        ...row,
        signup_rate: rate(row.signups_7d, row.mature_browsers),
        activation_rate: rate(row.activated_7d, row.mature_browsers),
        return_rate: rate(row.returned_days_1_to_7, row.mature_browsers),
      }))
    )
    const randomized = rows.filter((row) => row.cohort === 'new-visitor')
    const total = (variant: string) =>
      randomized
        .filter((row) => row.variant === variant)
        .reduce((sum, row) => sum + row.browsers, 0)
    const control = total('control')
    const treatment = total('treatment')
    const chiSquare =
      control + treatment
        ? (control - treatment) ** 2 / (control + treatment)
        : null
    console.log({ control, treatment, sampleRatioChiSquare: chiSquare })
    console.log(
      'Investigate assignment conflicts and a 50/50 sample-ratio chi-square above 3.841 before interpreting lift. A passing check does not prove the experiment valid.'
    )
    console.log(
      'Use new-visitor / signed_in_at_entry=false for signup and activation comparisons. Other cohorts describe voluntary adoption; they are not randomized controls.'
    )
  })
})
