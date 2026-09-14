import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import {
  uniq,
  countBy,
  mapValues,
  intersection,
  mergeWith,
  pickBy,
} from 'lodash'
import { log, logMemory, revalidateStaticProps } from 'shared/utils'
import { average, median } from 'common/util/math'
import { MINUTE_MS, sleep } from 'common/util/time'
import {
  createSupabaseDirectClient,
  type SupabaseDirectClient,
  type SupabaseTransaction,
} from 'shared/supabase/init'
import { bulkUpsert } from 'shared/supabase/utils'
import { saveCalibrationData } from 'shared/calculate-calibration'
import {
  MANA_PURCHASE_RATE_CHANGE_DATE,
  MANA_PURCHASE_RATE_REVERT_DATE,
} from 'common/envs/constants'
import {
  updateTxnStats,
  insertLatestManaStats,
} from 'shared/calculate-mana-stats'
import { getFeedConversionScores } from 'shared/feed-analytics'
import { buildArray } from 'common/util/array'
import { type Tables } from 'common/supabase/utils'
import { recalculateAllUserPortfolios } from 'shared/mana-supply'
import { MANIFOLD_DAU_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'

interface StatEvent {
  id: string
  userId: string
  ts: number
}
type DailyBetStats = {
  day: string
  betCount: number
  manaAmount: number
  totalAmount: number
  userCounts: { userId: string; betCount: number }[]
}
type StatUser = StatEvent & {
  d1BetCount: number
  freeQuestionsCreated: number | undefined
  bioIsLong: boolean | undefined
  dashboardCount: number
  referrerId: string | undefined
}

export const updateStatsCore = async (daysAgo: number) => {
  // We run the script at 4am, but we want data from the start of each day up until last midnight.
  const endDay = dayjs().tz('America/Los_Angeles')
  const end = endDay.format('YYYY-MM-DD')

  const pg = createSupabaseDirectClient()

  // Widen the window if earlier runs left holes. Only the trailing `daysAgo`
  // days are ever written, so a failure lasting longer than that puts those
  // days permanently out of reach of every later run: after the Aug 4-12
  // outage, dau, retention and topic_daus for Aug 3-5 are still NULL and no
  // nightly run would ever have filled them. Reaching back to the oldest gap
  // lets the next run repair what the last one missed.
  const recoveryDaysAgo = await getRecoveryDaysAgo(pg, end, daysAgo)
  if (recoveryDaysAgo !== daysAgo) {
    log(
      `Widening stats window from ${daysAgo} to ${recoveryDaysAgo} days to fill gaps`
    )
  }
  const recoveryStart = endDay
    .subtract(recoveryDaysAgo, 'day')
    .format('YYYY-MM-DD')

  // Held, not thrown, for the same reason the ordering below exists: the steps
  // after this one do not depend on it, and letting an activity failure abort
  // the job is what left mana_supply_stats and the /stats page stale for weeks
  // at a time. Rethrown at the end so the run still counts as failed.
  let activityError: unknown
  try {
    await updateStatsBetween(pg, recoveryStart, end)
  } catch (err) {
    activityError = err
    log.error(
      'updateStatsBetween failed; continuing with the rest of the job',
      {
        error: err instanceof Error ? err.message : String(err),
      }
    )
  }

  const startOfYesterday = endDay.subtract(1, 'day').startOf('day').valueOf()
  await updateTxnStats(pg, startOfYesterday, 1)

  // Snapshot mana supply, then rebuild the /stats page, BEFORE the heavy
  // recalculateAllUserPortfolios pass below. That pass is slow and, on the
  // scheduler (which deliberately runs without a statement_timeout), can stall
  // for hours during the saturated nightly maintenance window. Previously it
  // ran first, so when it stalled the job never reached insertLatestManaStats
  // OR revalidateStaticProps: the mana_supply_stats snapshot was skipped (the
  // chart flatlined ~June 15-27 2026) and, worse, the static /stats page was
  // never rebuilt, so every tab froze at an old build even though daily_stats
  // and txn_summary_stats had been computed fresh. Running these first means
  // the page regenerates nightly regardless of whether the recalc finishes.
  // insertLatestManaStats reads user_portfolio_history_latest, kept fresh by
  // the every-minute update-user-portfolio-histories job, so it does not need
  // the full recalc to have run first.
  await insertLatestManaStats(pg)

  // Best-effort: calibration data isn't shown on /stats, so a failure here
  // must not block the page revalidation below.
  try {
    await saveCalibrationData(pg)
  } catch (err) {
    log.error('saveCalibrationData failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  await revalidateStaticProps(`/stats`)

  // Heavy, best-effort, and intentionally last: a stall or error here must not
  // prevent the stats writes and page revalidation above.
  try {
    await recalculateAllUserPortfolios(pg)
  } catch (err) {
    log.error('recalculateAllUserPortfolios failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  if (activityError) throw activityError

  log('Done')
}

export const updateCashStatsCore = async (daysAgo: number) => {
  const endDay = dayjs().tz('America/Los_Angeles')
  const startDay = endDay.subtract(daysAgo, 'day')
  const end = endDay.format('YYYY-MM-DD')
  const start = startDay.format('YYYY-MM-DD')

  const pg = createSupabaseDirectClient()
  await updateCashActivityStats(pg, start, end)
  await updateDailyCashSales(pg, start, end)
}

// How many days back this run should reach: the requested window, extended to
// the oldest day in the last MAX_RECOVERY_DAYS whose stats never landed.
// dau is the probe because it is written for every day the job completes and
// for no day it does not.
const getRecoveryDaysAgo = async (
  pg: SupabaseDirectClient,
  end: string,
  requested: number
) => {
  const row = await pg.oneOrNone<{ oldest_gap: string | null }>(
    `with wanted as (
      select generate_series($1::date - $2::int, $1::date - 1, interval '1 day')::date as day
    )
    select min(w.day)::text as oldest_gap
    from wanted w
    left join daily_stats s on s.start_date = w.day
    where s.dau is null`,
    [end, MAX_RECOVERY_DAYS]
  )
  if (!row?.oldest_gap) return requested
  // Yesterday is always "missing" before a run — that is the day this run is
  // here to write, not a gap — and it yields a 1-day reach, well inside the
  // requested window, so it never widens anything on its own.
  const gapDays = dayjs(end).diff(dayjs(row.oldest_gap), 'day') + 1
  return Math.min(Math.max(requested, gapDays), MAX_RECOVERY_DAYS)
}

// YYYY-MM-DD
export const updateStatsBetween = async (
  pg: SupabaseDirectClient,
  start: string,
  end: string
) => {
  await updateActivityStats(pg, start, end)
  await updateDailySales(pg, start, end)
  await updateConversionScores(pg, start, end)
}

/**
 * @deprecated CASH path only. The mana path reads the daily activity rollup;
 * see materializeActivityDays. Kept because updateCashActivityStats still
 * calls it, though no job registers the cash stats job any more.
 */
async function getDailyBets(
  pg: SupabaseDirectClient,
  start: string,
  end: string,
  token?: 'CASH'
) {
  // Aggregated in SQL: shipping every bet via json_agg (~2.6M rows / ~320MB
  // of JSON over the 68-day buffer window) outgrew the 1-hour client
  // query_timeout as bet volume rose, which killed this job — and every
  // daily_stats/txn/mana-supply write after it — nightly from 2026-08-04.
  // The stats only need per-day totals and per-user bet counts.
  const bets = await pg.manyOrNone(
    `with per_user as (
      select
        date_trunc('day', b.created_time at time zone 'america/los_angeles')::date as day,
        b.user_id,
        count(*) as bet_count,
        sum(b.amount) filter (where c.token = 'MANA') as mana_amount,
        sum(b.amount) as total_amount
      from contract_bets b join contracts c on b.contract_id = c.id
      where
        b.created_time >= date_to_midnight_pt($1)
        and b.created_time < date_to_midnight_pt($2)
        and is_redemption = false
        and ($3 is null or c.token = $3)
      group by 1, 2
    )
    select
      day,
      sum(bet_count)::int as "betCount",
      coalesce(sum(mana_amount), 0)::double precision as "manaAmount",
      coalesce(sum(total_amount), 0)::double precision as "totalAmount",
      json_agg(json_build_object('userId', user_id, 'betCount', bet_count)) as "userCounts"
    from per_user
    group by day
    order by day asc`,
    [start, end, token]
  )

  return bets as DailyBetStats[]
}

async function getDailyComments(
  pg: SupabaseDirectClient,
  start: string,
  end: string,
  token?: 'CASH'
) {
  const cashCommentsFilter =
    token === 'CASH'
      ? `and c.data->>'siblingContractId' is not null and c.token = 'MANA'`
      : ''
  const comments = await pg.manyOrNone(
    `select
      date_trunc('day', cc.created_time at time zone 'america/los_angeles')::date as day,
      json_agg(json_build_object(
        'ts', ts_to_millis(cc.created_time),
        'userId', cc.user_id,
        'id', comment_id
      )) as values
    from contract_comments cc
    join contracts c on cc.contract_id = c.id
    where
      cc.created_time >= date_to_midnight_pt($1)
      and cc.created_time < date_to_midnight_pt($2)
      ${cashCommentsFilter}
    group by day
    order by day asc`,
    [start, end]
  )

  return comments as { day: string; values: StatEvent[] }[]
}

async function getDailyContracts(
  pg: SupabaseDirectClient,
  start: string,
  end: string,
  token?: 'CASH'
) {
  const contracts = await pg.manyOrNone(
    `select
      date_trunc('day', created_time at time zone 'america/los_angeles')::date as day,
      json_agg(json_build_object(
        'ts', ts_to_millis(created_time),
        'userId', creator_id,
        'id', id
      )) as values
    from contracts
    where
      created_time >= date_to_midnight_pt($1)
      and created_time < date_to_midnight_pt($2)
      and ($3 is null or token = $3)
    group by day
    order by day asc`,
    [start, end, token]
  )

  return contracts as { day: string; values: StatEvent[] }[]
}

async function getDailyNewUsers(
  pg: SupabaseDirectClient,
  start: string,
  end: string
) {
  const users = await pg.manyOrNone(
    `with all_new_users as (
      select
        u.created_time,
        u.id,
        (u.data->>'bio') as bio,
        (u.data->'freeQuestionsCreated')::int as free_questions_created,
        count(cb.bet_id) filter (where cb.bet_id is not null)
          + (
            select count(*)
            from contract_perp_events e
            where e.user_id = u.id
              and e.ts >= u.created_time
              and e.ts <= u.created_time + interval '24 hours'
              and e.event_type in ('open', 'add', 'close')
              and e.data->>'reason' is distinct from 'flip'
              and e.data->>'reason' is distinct from 'resolve-market'
          ) as bet_count_within_24h,
        count(d.id) filter (where d.id is not null) as dashboard_count,
        u.data->>'referredByUserId' as referrer_id
      from users u
        left join contract_bets cb on u.id = cb.user_id and cb.is_redemption = false
        and (cb.created_time >= u.created_time and cb.created_time <= u.created_time + interval '24 hours')
      left join dashboards d on u.id = d.creator_id
    where
      u.created_time >= date_to_midnight_pt($1)
      and u.created_time < date_to_midnight_pt($2)
      and u.data->'fromLove' is null
    group by u.id
    )
    select
      date_trunc('day', created_time at time zone 'america/los_angeles')::date as day,
      json_agg(json_build_object(
        'ts', ts_to_millis(created_time),
        'userId', id,
        'id', id,
        'bioIsLong', length(bio) > 10,
        'freeQuestionsCeated', free_questions_created,
        'd1BetCount', bet_count_within_24h,
        'dashboardCount', dashboard_count,
        'referrerId', referrer_id
      )) as values
    from all_new_users
    group by day
    order by day asc`,
    [start, end]
  )

  return users as { day: string; values: StatUser[] }[]
}

// this should at least be two months for monthly stats
const bufferDays = 61

// Every rollup rebuild is one day wide and carries its own server-side
// deadline. Both properties are load-bearing. One day keeps the planner on the
// created_time index — at ~30 days it flips to a full scan of the
// contract_bets partial index, and it flips on ESTIMATED rows, so the margin
// moves whenever autoanalyze runs. And a per-statement deadline means no
// single statement can absorb the whole run's time the way the 68-day fetch
// did: it burned the full client hour and wrote nothing.
const CHUNK_STATEMENT_TIMEOUT = '300s'
const CHUNK_RETRIES = 1
const CHUNK_RETRY_DELAY_MS = 15 * 1000
// A run that cannot get through its rebuild list inside the budget stops and
// says so instead of grinding on into the morning. Days already rebuilt are
// committed, so the next run resumes rather than restarting.
const MATERIALIZE_BUDGET_MS = 25 * MINUTE_MS
// How far back a run will reach to repair days an earlier failure left empty.
// Bounded so one bad month cannot hand a single night an unbounded backlog.
//
// This is deliberately below bufferDays, and it is the automatic repair
// horizon: an outage longer than 30 days leaves the days beyond it for the
// backfill script plus a manual `yarn update-stats <start> <end>`. Matching
// bufferDays instead would let one night rebuild 61 days, which is most of the
// work this change exists to stop doing.
const MAX_RECOVERY_DAYS = 30

// [start, end) as YYYY-MM-DD. Iterating and formatting (rather than diffing)
// keeps this correct across DST, where a local day is 23 or 25 hours long.
const listDays = (start: string, end: string) => {
  const days: string[] = []
  let day = dayjs(start)
  while (day.format('YYYY-MM-DD') < end) {
    days.push(day.format('YYYY-MM-DD'))
    day = day.add(1, 'day')
  }
  return days
}

const withChunkTimeout = <T>(
  pg: SupabaseDirectClient,
  fn: (tx: SupabaseTransaction) => Promise<T>
) =>
  pg.tx(async (tx) => {
    // one(), not none(): set_config returns a row, and none() rejects on any
    // returned row — the mistake that kept score-contracts down for four days
    // (#3973, fixed in #3988). `true` scopes the setting to this transaction.
    await tx.one(`select set_config('statement_timeout', $1, true)`, [
      CHUNK_STATEMENT_TIMEOUT,
    ])
    return fn(tx)
  })

// Rebuilds one LA calendar day of the rollup. $1 is the day, $2 the next day,
// so date_to_midnight_pt brackets exactly that day and the date_trunc grouping
// the old per-day queries did becomes a constant.
const REBUILD_ACTIVITY_DAY = `
  with bets as materialized (
    select b.user_id, count(*)::int as n,
      sum(b.amount) filter (where c.token = 'MANA') as mana_amount
    from contract_bets b join contracts c on b.contract_id = c.id
    where b.created_time >= date_to_midnight_pt($1)
      and b.created_time < date_to_midnight_pt($2)
      and b.is_redemption = false
    group by b.user_id
  ),
  created as materialized (
    -- creator_id is nullable. The old code tolerated a null creator (it became
    -- one more entry in the day's id list); here it would violate
    -- daily_user_activity.user_id and make the day permanently unbuildable.
    select creator_id as user_id, count(*)::int as n
    from contracts
    where created_time >= date_to_midnight_pt($1)
      and created_time < date_to_midnight_pt($2)
      and creator_id is not null
    group by creator_id
  ),
  comments as materialized (
    -- The contracts join looks dead here (nothing selects from c) but it is an
    -- inner join, so it drops comments whose contract is gone. Keep it: the
    -- query it replaces had it, and removing it would change comment_count.
    select cc.user_id, count(*)::int as n
    from contract_comments cc join contracts c on cc.contract_id = c.id
    where cc.created_time >= date_to_midnight_pt($1)
      and cc.created_time < date_to_midnight_pt($2)
    group by cc.user_id
  ),
  perps as materialized (
    select e.user_id, count(*)::int as n
    from contract_perp_events e
    where e.ts >= date_to_midnight_pt($1)
      and e.ts < date_to_midnight_pt($2)
      and e.user_id is not null
      and e.event_type in ('open', 'add', 'close')
      and e.data->>'reason' is distinct from 'flip'
      and e.data->>'reason' is distinct from 'resolve-market'
    group by e.user_id
  ),
  viewers as (
    select count(distinct data->>'deviceId')::int as n
    from user_events
    where ts >= date_to_midnight_pt($1) and ts < date_to_midnight_pt($2)
  ),
  per_user as (
    select user_id, sum(n)::int as action_count
    from (
      select user_id, n from bets
      union all select user_id, n from created
      union all select user_id, n from comments
      union all select user_id, n from perps
    ) actions
    group by user_id
  ),
  ins_users as (
    insert into daily_user_activity (day, user_id, action_count)
    select $1::date, user_id, action_count from per_user
    returning 1
  )
  insert into daily_activity_totals
    (day, bet_count, mana_amount, contract_count, comment_count, viewer_count,
     computed_at)
  select $1::date,
    coalesce((select sum(n) from bets), 0)::int,
    coalesce((select sum(mana_amount) from bets), 0),
    coalesce((select sum(n) from created), 0)::int,
    coalesce((select sum(n) from comments), 0)::int,
    coalesce((select n from viewers), 0),
    now()
  on conflict (day) do update set
    bet_count = excluded.bet_count,
    mana_amount = excluded.mana_amount,
    contract_count = excluded.contract_count,
    comment_count = excluded.comment_count,
    viewer_count = excluded.viewer_count,
    computed_at = excluded.computed_at`

// Rebuilds the given days, one committed transaction each, serially.
//
// Serially on purpose. The five concurrent window-wide fetches this replaces
// were not just individually large, they evicted each other's pages: three
// identical chunk queries run concurrently on prod produced one success and
// two timeouts, while the same three run one after another all succeeded.
export const materializeActivityDays = async (
  pg: SupabaseDirectClient,
  days: string[],
  budgetMs = MATERIALIZE_BUDGET_MS
) => {
  const deadline = Date.now() + budgetMs
  const failed: string[] = []
  const skipped: string[] = []

  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    if (Date.now() > deadline) {
      skipped.push(...days.slice(i))
      break
    }
    const next = dayjs(day).add(1, 'day').format('YYYY-MM-DD')
    for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt++) {
      try {
        await withChunkTimeout(pg, async (tx) => {
          await tx.none(
            `delete from daily_user_activity where day = $1::date`,
            [day]
          )
          await tx.none(REBUILD_ACTIVITY_DAY, [day, next])
        })
        break
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (attempt === CHUNK_RETRIES) {
          failed.push(day)
          log.warn(`[update-stats] could not rebuild activity for ${day}`, {
            error: message,
          })
        } else {
          await sleep(CHUNK_RETRY_DELAY_MS)
        }
      }
    }
  }

  // Throw only after the loop: every day that succeeded stays committed, which
  // is what lets the next run pick up where this one stopped. But do not let
  // the caller compute over a holed window — the trailing-window maths below
  // indexes by array position, so one missing day shifts wau/mau/m1 onto the
  // wrong dates instead of failing.
  if (failed.length || skipped.length) {
    throw new Error(
      `activity rollup incomplete — failed: [${failed.join(', ')}], ` +
        `out of time: [${skipped.join(', ')}]`
    )
  }
}

// The days this run must (re)build: everything it will write, plus any older
// day in the buffer that has never been computed. A missing totals row is the
// only way to distinguish "never computed" from "computed, nobody active".
const getDaysToMaterialize = (
  pg: SupabaseDirectClient,
  startWithBuffer: string,
  start: string,
  end: string
) =>
  pg.map(
    `with wanted as (
      select generate_series($1::date, $3::date - 1, interval '1 day')::date as day
    )
    select w.day::text as day
    from wanted w
    left join daily_activity_totals t on t.day = w.day
    where w.day >= $2::date or t.day is null
    order by 1`,
    [startWithBuffer, start, end],
    (r: { day: string }) => r.day
  )

type DailyActivity = {
  day: string
  betCount: number
  manaAmount: number
  contractCount: number
  commentCount: number
  viewerCount: number
  userCounts: { userId: string; actionCount: number }[]
}

const getDailyActivity = async (
  pg: SupabaseDirectClient,
  start: string,
  end: string
) => {
  // day::text because pg-promise parses date (oid 1082) with the identity
  // parser (shared/supabase/init.ts), and everything downstream keys on
  // 'YYYY-MM-DD' strings.
  const activity = await pg.manyOrNone(
    `select
      t.day::text as day,
      t.bet_count as "betCount",
      t.mana_amount::double precision as "manaAmount",
      t.contract_count as "contractCount",
      t.comment_count as "commentCount",
      t.viewer_count as "viewerCount",
      coalesce(a.user_counts, '[]'::json) as "userCounts"
    from daily_activity_totals t
    left join lateral (
      select json_agg(json_build_object(
        'userId', d.user_id, 'actionCount', d.action_count
      )) as user_counts
      from daily_user_activity d where d.day = t.day
    ) a on true
    where t.day >= $1::date and t.day < $2::date
    order by t.day`,
    [start, end]
  )

  return activity as DailyActivity[]
}

export const updateActivityStats = async (
  pg: SupabaseDirectClient,
  start: string,
  end: string
) => {
  const startWithBuffer = dayjs(start)
    .subtract(bufferDays, 'days')
    .format('YYYY-MM-DD')

  log(`Fetching data for activity stats between ${startWithBuffer} and ${end}`)
  // Rebuild only the days this run writes, plus any older buffer day that has
  // never been computed (a hole left by an earlier failure). The rest of the
  // window is read from the rollup instead of re-derived from source tables.
  const daysToBuild = await getDaysToMaterialize(
    pg,
    startWithBuffer,
    start,
    end
  )
  log(`Rebuilding ${daysToBuild.length} day(s) of activity`)
  await materializeActivityDays(pg, daysToBuild)

  const daily = await getDailyActivity(pg, startWithBuffer, end)
  const windowDays = listDays(startWithBuffer, end)
  if (daily.length !== windowDays.length) {
    throw new Error(
      `activity rollup covers ${daily.length} of ${windowDays.length} days ` +
        `in ${startWithBuffer}..${end}; refusing to compute trailing windows ` +
        `over a gap`
    )
  }
  logMemory()

  log('upsert viewer counts')
  // Sliced like its three siblings below. Without the slice, the earliest days
  // in the window get wav/mav from a slice(i-6, i+1) whose negative start wraps
  // to the END of the array, yielding an empty range and average([]) === 0 —
  // which is how 569 daily_stats rows came to hold wav = 0, and 621 mav = 0,
  // while the dav beside them is intact. Each day now gets its final value
  // while its trailing window is still complete, and is never revisited. This
  // removes writes only; it does not repair the rows already zeroed.
  //
  // Filtered on dav for the same reason as the scalars below: the rollup stores
  // a zero for a day whose events are missing, and writing that would both
  // replace a NULL with a 0 and drag the following 7 days of wav and 30 of mav.
  const viewerRows = daily.map((d, i) => ({
    start_date: d.day,
    dav: d.viewerCount,
    wav: average(daily.slice(i - 6, i + 1).map((v) => v.viewerCount)),
    mav: average(daily.slice(i - 29, i + 1).map((v) => v.viewerCount)),
  }))
  await bulkUpsertStats(
    pg,
    viewerRows.slice(bufferDays).filter((r) => r.dav > 0)
  )

  // Mirror daily DAV into the `manifold-dau` oracle feed. Each point is
  // keyed at midnight America/Los_Angeles for its day (matching daily_stats
  // semantics). Idempotent insert so the rolling bufferDays window can
  // safely re-emit old days.
  log('upsert manifold-dau oracle points')
  // Best-effort: this mirror is an internal metric series, not part of the
  // stats pipeline's contract. oracle_prices is append-only and the insert
  // is on-conflict-do-nothing, so a re-run that recomputes a different
  // viewer count for an already-stored day makes applyOraclePointToLivePerps
  // throw on the mismatch — deterministically, for the rest of the day.
  // Unwrapped, that aborted the run before every remaining daily_stats write
  // (bets, DAU/WAU/MAU, retention, new-user), none of which have anything to
  // do with perps.
  // Zero-viewer days are excluded rather than published as a 0: oracle_prices
  // is append-only, so a spurious 0 is permanent, and live perps mark against
  // the latest point.
  const dauPoints = daily.filter((d) => d.viewerCount > 0)
  try {
    await insertOraclePrices(
      pg,
      MANIFOLD_DAU_FEED_ID,
      dauPoints.map((d) => ({
        ts: dayjs.tz(d.day, 'America/Los_Angeles').startOf('day').valueOf(),
        price: d.viewerCount,
      }))
    )
    const latestDau = dauPoints[dauPoints.length - 1]
    if (latestDau) {
      await applyOraclePointToLivePerps(pg, MANIFOLD_DAU_FEED_ID, {
        ts: dayjs
          .tz(latestDau.day, 'America/Los_Angeles')
          .startOf('day')
          .valueOf(),
        price: latestDau.viewerCount,
      })
    }
  } catch (error) {
    log.error(
      '[update-stats] manifold-dau oracle mirror failed; continuing with daily stats',
      { error }
    )
  }

  // The three scalar upserts below are sliced to the days this run writes.
  // Previously they rewrote all 68 days nightly with values that only moved
  // for one reason: contract_bets.amount is mutable, so a limit order filling
  // later raises its day's bet_amount. That means a day now settles on the
  // value it has seven days out rather than sixty-eight — measured at ~0.4% of
  // a day's mana, always understating. The previous 68-day cutoff was no less
  // arbitrary, and rewriting history nightly is what the rollup exists to stop.
  //
  // .filter(...) keeps the NULL-vs-zero distinction: the per-day queries these
  // replace returned no row at all for a day with no bets, so daily_stats held
  // NULL. The rollup has a row for every day, so an unfiltered write would turn
  // those NULLs into zeroes.
  const written = daily.slice(bufferDays)

  log('upsert bets counts and totals')
  await bulkUpsertStats(
    pg,
    written
      .filter((d) => d.betCount > 0)
      .map((d) => ({
        start_date: d.day,
        bet_count: d.betCount,
        bet_amount: d.manaAmount / 100,
      }))
  )

  log('upsert contract counts')
  await bulkUpsertStats(
    pg,
    written
      .filter((d) => d.contractCount > 0)
      .map((d) => ({ start_date: d.day, contract_count: d.contractCount }))
  )

  log('upsert comment counts')
  await bulkUpsertStats(
    pg,
    written
      .filter((d) => d.commentCount > 0)
      .map((d) => ({ start_date: d.day, comment_count: d.commentCount }))
  )

  // action_count already sums the four sources the old per-day queries were
  // merged from — bets, markets created, comments, and user-initiated perp
  // trades — per user per day, which is exactly what the countBy over the
  // concatenated id lists produced. median sorts internally, so order does not
  // matter here.
  log('upsert "average" daily user actions')
  await bulkUpsertStats(
    pg,
    written
      // Same NULL-vs-zero guard as the scalars: a day with nobody active was
      // absent from the old per-day results and so left NULL, not zeroed.
      .filter((d) => d.userCounts.length > 0)
      .map((d) => {
        const counts = d.userCounts
          .map((u) => u.actionCount)
          .filter((c) => c > 1)
        return {
          start_date: d.day,
          avg_user_actions: counts.length === 0 ? 0 : median(counts),
        }
      })
  )

  // Stricter DAU includes market creation, comments, and user-initiated trades.
  // One row per (day, user) in the rollup, so these are already distinct and
  // already ordered by day.
  const dailyUserIds = daily.map((d) => ({
    day: d.day,
    values: d.userCounts.map((u) => u.userId),
  }))

  log('upsert dau, wau, mau, d1, w1, m1')

  await bulkUpsertStats(
    pg,
    dailyUserIds
      .map((today, i) => ({
        start_date: today.day,
        dau: today.values.length,
        wau: uniqBetween(dailyUserIds, i - 6, i + 1).length,
        mau: uniqBetween(dailyUserIds, i - 29, i + 1).length,
        d1: i == 0 ? 0 : retention(dailyUserIds[i - 1].values, today.values),
        w1: retention(
          uniqBetween(dailyUserIds, i - 13, i - 6), // 2 weeks ago
          uniqBetween(dailyUserIds, i - 6, i + 1) // last week
        ),
        m1: retention(
          uniqBetween(dailyUserIds, i - 59, i - 29), // 2 months ago
          uniqBetween(dailyUserIds, i - 29, i + 1) // last month
        ),
      }))
      .slice(bufferDays)
  )

  log('upsert engaged users')
  {
    const getTwiceActive = (
      dailyActiveIds: { day: string; values: string[] }[]
    ) => {
      const allIds = dailyActiveIds.flatMap((d) => d.values)
      const counts = countBy(allIds, (id) => id)
      return Object.keys(pickBy(counts, (count) => count >= 2))
    }

    const engagedUsers = dailyUserIds
      .map(({ day }, i) => {
        const start = Math.max(0, i - 20)
        const week1 = Math.max(0, i - 13)
        const week2 = Math.max(0, i - 6)
        const end = i + 1

        const engaged1 = getTwiceActive(dailyUserIds.slice(start, week1))
        const engaged2 = getTwiceActive(dailyUserIds.slice(week1, week2))
        const engaged3 = getTwiceActive(dailyUserIds.slice(week2, end))
        return {
          start_date: day,
          engaged_users: intersection(engaged1, engaged2, engaged3).length,
        }
      })
      .slice(bufferDays)

    await bulkUpsertStats(pg, engagedUsers)
  }

  // new user stats
  {
    log('fetch daily new users')
    const dailyNewUsers = await getDailyNewUsers(pg, startWithBuffer, end)

    log('upsert signups')
    await bulkUpsertStats(
      pg,
      dailyNewUsers.map((users) => ({
        start_date: users.day,
        signups: users.values.length,
      }))
    )

    const dailyNewRealUsers = dailyNewUsers.map(({ day, values }) => ({
      day,
      values: values.filter((u) => !isUserLikelySpammer(u)),
    }))

    const dailyNewRealUserIds = dailyNewRealUsers.map(({ day, values }) => ({
      day,
      values: values.map((u) => u.id),
    }))

    log('upsert real new user stats')
    await bulkUpsertStats(
      pg,
      dailyNewRealUserIds
        .map(({ day, values: users }, i) => ({
          start_date: day,
          signups_real: users.length,
          nd1: retention(users, dailyUserIds[i + 1]?.values),
          nw1: retention(
            uniqBetween(dailyNewRealUserIds, i - 13, i - 6), // new users 2 weeks ago
            uniqBetween(dailyUserIds, i - 6, i + 1) // active users last week
          ),
        }))
        .slice(bufferDays)
    )

    log('upsert new user bets')

    const newUsersBets = dailyNewRealUsers
      .map(({ day, values: users }, i) => ({
        start_date: day,
        activation: average(users.map((u) => (u.d1BetCount > 0 ? 1 : 0))),
        d1_bet_average: average(users.map((u) => u.d1BetCount)),
        d1_bet_3_day_average: average(
          dailyNewRealUsers
            .slice(i - 2, i + 1)
            .map((u) => average(u.values.map((u) => u.d1BetCount)))
        ),
      }))
      .slice(2)

    await bulkUpsertStats(pg, newUsersBets)

    log('upsert % active d1 to d3')
    const fracDaysActiveD1ToD3 = dailyNewRealUserIds
      .slice(0, -3)
      .map(({ day, values: today }, i) => {
        const week = dailyUserIds.slice(i + 1, i + 4).flatMap((d) => d.values)
        const counts = countBy(week, (id) => id)

        return {
          start_date: day,
          active_d1_to_d3: average(today.map((id) => counts[id] ?? 0)) / 3,
        }
      })

    await bulkUpsertStats(pg, fracDaysActiveD1ToD3)
  }

  log('calculate topic DAUs')
  const topicDaus = await calculateTopicDaus(pg, start, end)

  await bulkUpsertStats(
    pg,
    Object.entries(topicDaus).map(([date, topicCounts]) => ({
      start_date: date,
      topic_daus: topicCounts,
    }))
  )
}

const isUserLikelySpammer = (user: StatUser) =>
  !user.d1BetCount &&
  (user.bioIsLong || !!user.freeQuestionsCreated || !!user.dashboardCount)

async function updateDailySales(
  pg: SupabaseDirectClient,
  start: string,
  end: string
) {
  log('fetch daily sales')
  const sales = await pg.manyOrNone<{ start_date: string; sales: number }>(
    `select
      date_trunc('day', created_time at time zone 'america/los_angeles')::date as start_date,
      sum(
        case when created_time > $3 and created_time < $4 then amount / 1000 else amount / 100 end
      ) as sales
    from txns
      where category = 'MANA_PURCHASE'
      and created_time >= date_to_midnight_pt($1)
      and created_time < date_to_midnight_pt($2)
    group by start_date
    order by start_date asc`,
    [
      start,
      end,
      MANA_PURCHASE_RATE_CHANGE_DATE.toISOString(),
      MANA_PURCHASE_RATE_REVERT_DATE.toISOString(),
    ]
  )

  log('upsert daily sales')
  await bulkUpsertStats(pg, sales)
  await pg.none(
    `update daily_stats set sales = 0 where sales is null and start_date >= $1 and start_date < $2`,
    [start, end]
  )
}

async function updateDailyCashSales(
  pg: SupabaseDirectClient,
  start: string,
  end: string
) {
  log('fetch daily sales')
  const sales = await pg.manyOrNone<{ start_date: string; sales: number }>(
    `select
      date_trunc('day', created_time at time zone 'america/los_angeles')::date as start_date,
      sum(amount) as cash_sales
    from txns
      where category = 'CASH_BONUS'
      and created_time >= date_to_midnight_pt($1)
      and created_time < date_to_midnight_pt($2)
    group by start_date
    order by start_date asc`,
    [start, end]
  )

  log('upsert daily cash sales')
  await bulkUpsertStats(pg, sales)
  await pg.none(
    `update daily_stats set cash_sales = 0 where cash_sales is null and start_date >= $1 and start_date < $2`,
    [start, end]
  )
}

async function updateConversionScores(
  pg: SupabaseDirectClient,
  start: string,
  end: string
) {
  log('fetch feed conversion')
  const scores = await getFeedConversionScores(pg, start, end)
  log('upsert feed conversion')
  await bulkUpsertStats(pg, scores)
}

const retention = (
  cohort1: string[] | undefined,
  cohort2: string[] | undefined
) => {
  if (!cohort1 || !cohort2) return undefined
  // Set membership rather than Array.includes: cohorts are month-sized (~4k
  // ids), so the nested scan is ~16M string comparisons per call on the single
  // scheduler event loop, and gap recovery can widen the window to 30 days of
  // them. Same value either way — retention does not care about order.
  const cohort2Ids = new Set<string>()
  cohort2.forEach((id) => cohort2Ids.add(id))
  return average(cohort1.map((id) => (cohort2Ids.has(id) ? 1 : 0)))
}

// sum of distinct [start, end)
const uniqBetween = <T = any>(
  arr: { day: string; values: T[] }[],
  start: number,
  end: number
) => uniq(arr.slice(start, end).flatMap(({ values }) => values))

const bulkUpsertStats = async (
  pg: SupabaseDirectClient,
  stats: Tables['daily_stats']['Insert'][]
) => {
  await bulkUpsert(
    pg,
    'daily_stats',
    'start_date',
    stats
    // TODO: no on conflict to fix bad values, if you insert bad values you have to delete them!!
  )
}

async function calculateTopicDaus(
  pg: SupabaseDirectClient,
  start: string,
  end: string
) {
  // Get daily active users per group with 50+ users filter.
  //
  // Run a day at a time, under the same per-statement deadline as the rollup
  // rebuild. This unions four sources through group_contracts and is now the
  // largest scan left in the job, so it is the next thing that would sit on
  // the client timeout as volume grows. Splitting by day is exact: the
  // `having count(distinct user_id) > 50` below is already evaluated per
  // (day, group_id), so no group's count spans a chunk boundary.
  const topicDauSql = `
    with daily_active as (
      select 
        date_trunc('day', b.created_time at time zone 'america/los_angeles')::date as day,
        b.user_id,
        gc.group_id
      from contract_bets b
      join contracts c on b.contract_id = c.id 
      join group_contracts gc on c.id = gc.contract_id
      where b.created_time >= date_to_midnight_pt($1)
        and b.created_time < date_to_midnight_pt($2)
      union
      select
        date_trunc('day', e.ts at time zone 'america/los_angeles')::date as day,
        e.user_id,
        gc.group_id
      from contract_perp_events e
      join group_contracts gc on e.contract_id = gc.contract_id
      where e.ts >= date_to_midnight_pt($1)
        and e.ts < date_to_midnight_pt($2)
        and e.user_id is not null
        and e.event_type in ('open', 'add', 'close')
        and e.data->>'reason' is distinct from 'flip'
        and e.data->>'reason' is distinct from 'resolve-market'
      union
      select 
        date_trunc('day', cc.created_time at time zone 'america/los_angeles')::date as day,
        user_id,
        gc.group_id
      from contract_comments cc
      join contracts c on cc.contract_id = c.id
      join group_contracts gc on c.id = gc.contract_id
      where cc.created_time >= date_to_midnight_pt($1)
        and cc.created_time < date_to_midnight_pt($2)
      union
      select
        date_trunc('day', created_time at time zone 'america/los_angeles')::date as day,
        creator_id as user_id,
        gc.group_id
      from contracts c
      join group_contracts gc on c.id = gc.contract_id
      where c.created_time >= date_to_midnight_pt($1)
        and c.created_time < date_to_midnight_pt($2)
    ),
    group_counts as (
      select 
        day,
        group_id,
        count(distinct user_id) as user_count
      from daily_active
      group by day, group_id
      having count(distinct user_id) > 50
    )
    select
      day,
      jsonb_object_agg(group_id, user_count) as group_counts
    from group_counts
    group by day
  `

  const topicDaus: Record<string, Record<string, number>> = {}
  const days = listDays(start, end)
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    const next = dayjs(day).add(1, 'day').format('YYYY-MM-DD')
    const rows = await withChunkTimeout(pg, (tx) =>
      tx.manyOrNone<{ day: string; group_counts: Record<string, number> }>(
        topicDauSql,
        [day, next]
      )
    )
    rows.forEach((row) => {
      topicDaus[row.day] = row.group_counts
    })
  }
  return topicDaus
}

export const updateCashActivityStats = async (
  pg: SupabaseDirectClient,
  start: string,
  end: string
) => {
  const startWithBuffer = dayjs(start)
    .subtract(bufferDays, 'days')
    .format('YYYY-MM-DD')

  log(
    `Fetching data for cash activity stats between ${startWithBuffer} and ${end}`
  )
  const [dailyBets, dailyContracts, dailyComments] = await Promise.all([
    getDailyBets(pg, startWithBuffer, end, 'CASH'),
    getDailyContracts(pg, startWithBuffer, end, 'CASH'),
    getDailyComments(pg, startWithBuffer, end, 'CASH'),
  ])
  logMemory()

  log('upsert cash bets counts and totals')
  await bulkUpsertStats(
    pg,
    dailyBets.map((bets) => ({
      start_date: bets.day,
      cash_bet_count: bets.betCount,
      cash_bet_amount: bets.totalAmount,
    }))
  )

  log('upsert cash contract counts')
  await bulkUpsertStats(
    pg,
    dailyContracts.map((contracts) => ({
      start_date: contracts.day,
      cash_contract_count: contracts.values.length,
    }))
  )

  log('upsert comment counts')
  await bulkUpsertStats(
    pg,
    dailyComments.map((comments) => ({
      start_date: comments.day,
      cash_comment_count: comments.values.length,
    }))
  )

  // unique ids across contract, bet, and comment actions
  const contractUsersByDay = Object.fromEntries(
    dailyContracts.map((contracts) => [
      contracts.day,
      contracts.values.map((c) => c.userId),
    ])
  )
  // One entry per bet, not per user: the countBy in the median-actions calc
  // below needs the multiset, and uniq covers the DAU-style consumers.
  const betUsersByDay = Object.fromEntries(
    dailyBets.map((bets) => [
      bets.day,
      bets.userCounts.flatMap((u) =>
        Array.from({ length: u.betCount }, () => u.userId)
      ),
    ])
  )
  const commentUsersByDay = Object.fromEntries(
    dailyComments.map((comments) => [
      comments.day,
      comments.values.map((c) => c.userId),
    ])
  )

  // average actions
  {
    const allIds = mergeWith(
      contractUsersByDay,
      betUsersByDay,
      commentUsersByDay,
      (a, b) => (a && b ? a.concat(b) : a || b)
    )

    const medianDailyUserActions = mapValues(allIds, (ids) => {
      const userIdCounts = countBy(ids, (id) => id)
      const countsFiltered = Object.values(userIdCounts).filter((c) => c > 1)
      return countsFiltered.length === 0 ? 0 : median(countsFiltered)
    })

    log('upsert "average" cash daily user actions')
    await bulkUpsertStats(
      pg,
      Object.entries(medianDailyUserActions).map(([day, median]) => ({
        start_date: day,
        cash_avg_user_actions: median,
      }))
    )
  }

  const contractBetOrCommentUniqueUsersByDay = mergeWith(
    betUsersByDay,
    contractUsersByDay,
    commentUsersByDay,
    (a, b) => {
      if (!a && !b) return []
      if (!a) return b
      if (!b) return a
      return uniq([...a, ...b])
    }
  )

  // stats using weird stricter dau calculation that only includes contracts, comments, users

  const dailyUserIds = Object.entries(contractBetOrCommentUniqueUsersByDay)
    .map(([day, values]) => ({ day, values }))
    .sort((a, b) => a.day.localeCompare(b.day))

  log('upsert cash dau, wau, mau, d1, w1, m1')

  await bulkUpsertStats(
    pg,
    dailyUserIds
      .map((today, i) => ({
        start_date: today.day,
        cash_dau: today.values.length,
        cash_wau: uniqBetween(dailyUserIds, i - 6, i + 1).length,
        cash_mau: uniqBetween(dailyUserIds, i - 29, i + 1).length,
        cash_d1:
          i == 0 ? 0 : retention(dailyUserIds[i - 1].values, today.values),
        cash_w1: retention(
          uniqBetween(dailyUserIds, i - 13, i - 6), // 2 weeks ago
          uniqBetween(dailyUserIds, i - 6, i + 1) // last week
        ),
        cash_m1: retention(
          uniqBetween(dailyUserIds, i - 59, i - 29), // 2 months ago
          uniqBetween(dailyUserIds, i - 29, i + 1) // last month
        ),
      }))
      .slice(bufferDays)
  )
}
