import { AB_TEST_ACCOUNT_OVERRIDES } from 'common/ab-test'
import {
  DISCOVERY_EXPOSURE_EVENT,
  DISCOVERY_RESULT_CLICK_EVENT,
  DISCOVERY_RESULTS_EVENT,
  DISCOVERY_SEARCH_ABORT_EVENT,
  DISCOVERY_SEARCH_ERROR_EVENT,
  DISCOVERY_SEARCH_REQUEST_EVENT,
} from 'common/discovery-experiment'
import { ENV_CONFIG } from 'common/envs/constants'
import { READ_ONLY_REPEATABLE_MODE } from 'shared/supabase/init'
import { runScript } from './run-script'

/**
 * Read-only scorecard for the discovery-v1 A/B test.
 *
 * Usage:
 *   yarn ts-node discovery-v1-report.ts YYYY-MM-DD [YYYY-MM-DD]
 *
 * Dates are midnight-to-midnight in Pacific time; the optional end is
 * exclusive and defaults to 30 minutes ago, allowing the outcome window to
 * mature. The causal rows use only the main Browse
 * Search (`sourceComponent = search`). Forced QA accounts, admins, and bots
 * are shown separately or excluded from the experiment comparison.
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const [start, end] = process.argv.slice(2)
const MAX_REPORT_DAYS = 31
const DAY_MS = 24 * 60 * 60 * 1000
const OUTCOME_WINDOW_MS = 30 * 60 * 1000

if (!start || !DATE_REGEX.test(start) || (end && !DATE_REGEX.test(end))) {
  console.error(
    'Usage: yarn ts-node discovery-v1-report.ts YYYY-MM-DD [YYYY-MM-DD]'
  )
  process.exit(1)
}

const parseIsoDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
    ? undefined
    : parsed
}
const parsedStart = parseIsoDate(start)
const now = new Date()
const parsedEnd = end ? parseIsoDate(end) : now
if (
  !parsedStart ||
  !parsedEnd ||
  parsedEnd <= parsedStart ||
  parsedEnd.getTime() - parsedStart.getTime() > MAX_REPORT_DAYS * DAY_MS ||
  (end !== undefined && parsedEnd.getTime() > now.getTime() - OUTCOME_WINDOW_MS)
) {
  console.error(
    `Report window must be valid, increasing, at most 31 days, and have a complete 30-minute outcome window.`
  )
  process.exit(1)
}
// Use one captured time across every query so a live report has one boundary.
const reportEndTime = now.toISOString()

type ScorecardRow = {
  segment: string
  variant: string
  presentations: number
  result_sets: number
  subjects: number
  market_ctr: number | null
  meaningful_action_rate: number | null
  post_ctr: number | null
  semantic_tail_ctr: number | null
  zero_market_rate: number | null
  avg_markets_presented: number | null
  prior_seen_top_ten_rate: number | null
  p95_initial_latency_ms: number | null
  compatibility_fallback_rate: number | null
}

type LiftRow = {
  segment: string
  metric: string
  desired_direction: string
  control_subjects: number
  treatment_subjects: number
  control_rate: number | null
  treatment_rate: number | null
  absolute_lift: number | null
  relative_lift: number | null
  ci_95_low: number | null
  ci_95_high: number | null
}

type RequestLiftRow = LiftRow & {
  decision_role: string
}

type ResultHealthRow = {
  segment: string
  variant: string
  result_sets: number
  avg_markets_loaded: number | null
  avg_distinct_markets_loaded: number | null
  duplicate_rate: number | null
  compatibility_fallback_rate: number | null
}

type ReliabilityRow = {
  surface: string
  assignment_source: string
  variant: string
  request_stage: string
  attempts: number
  successes: number
  terminal_errors: number
  client_aborts: number
  missing_outcomes: number
  success_rate: number | null
  error_rate: number | null
  abort_rate: number | null
  p95_success_latency_ms: number | null
  p95_terminal_error_latency_ms: number | null
}

const analysisCtes = `
with raw_presentations as (
  select distinct on (ue.data ->> 'presentationId')
    ue.ts,
    ue.user_id,
    ue.data ->> 'deviceId' as device_id,
    case
      when ue.user_id is not null then 'user:' || ue.user_id
      else 'device:' || (ue.data ->> 'deviceId')
    end as subject_id,
    ue.data ->> 'presentationId' as presentation_id,
    ue.data ->> 'resultSetId' as result_set_id,
    ue.data ->> 'variant' as variant,
    ue.data ->> 'assignmentSource' as assignment_source,
    ue.data ->> 'sourceComponent' as source_component,
    ue.data ->> 'surface' as surface,
    coalesce((ue.data ->> 'marketCount')::int, 0) as market_count,
    coalesce((ue.data ->> 'postCount')::int, 0) as post_count,
    coalesce((ue.data ->> 'semanticEligible')::boolean, false)
      as semantic_eligible,
    coalesce((ue.data ->> 'semanticMarketCount')::int, 0)
      as semantic_count,
    coalesce((ue.data ->> 'compatibilityFallback')::boolean, false)
      as compatibility_fallback,
    (ue.data ->> 'initialLatencyMs')::numeric as initial_latency_ms,
    ue.data
  from user_events ue
  left join users u on u.id = ue.user_id
  where ue.name = $3
    and ue.ts >= date_to_midnight_pt($1::date)
    and ue.ts < case
      when $2::date is null then $7::timestamptz - interval '30 minutes'
      else least(
        date_to_midnight_pt($2::date),
        $7::timestamptz - interval '30 minutes'
      )
    end
    and ue.data ->> 'presentationId' is not null
    and ue.data ->> 'variant' in ('control', 'treatment')
    and ue.data ->> 'assignmentSource' <> 'forced'
    and ue.data ->> 'sourceComponent' = 'search'
    and (ue.user_id is null or ue.user_id not in ($6:list))
    and coalesce(u.is_bot, false) = false
  order by ue.data ->> 'presentationId', ue.ts
),
selected_result_sets as (
  select distinct result_set_id from raw_presentations
),
result_set_compatibility as (
  select
    ue.data ->> 'resultSetId' as result_set_id,
    bool_or(
      coalesce(
        (ue.data ->> 'compatibilityFallback')::boolean,
        false
      )
    ) as used_compatibility_fallback
  from user_events ue
  join selected_result_sets selected
    on selected.result_set_id = ue.data ->> 'resultSetId'
  where ue.name = $4
    -- A presentation can reuse an SPA-cached result set from before the
    -- reporting window. Bound that lookup so this script can use the ts index
    -- instead of scanning the entire user_events table.
    and ue.ts >= date_to_midnight_pt($1::date) - interval '24 hours'
    and ue.ts < case
      when $2::date is null then $7::timestamptz
      else date_to_midnight_pt($2::date) + interval '30 minutes'
    end
  group by ue.data ->> 'resultSetId'
),
presentations as (
  select
    presentation.*,
    case
      when presentation.surface = 'for-you'
        and presentation.user_id is not null
        then 'for-you'
      when presentation.surface = 'for-you'
        then 'for-you-ineligible'
      when presentation.surface = 'text-search'
        and presentation.semantic_eligible
        then 'text-search-low-hit'
      when presentation.surface = 'text-search'
        then 'text-search-other'
      else 'browse-guardrail'
    end as segment
  from raw_presentations presentation
),
result_pages as (
  select
    ue.ts,
    ue.data ->> 'resultSetId' as result_set_id,
    (ue.data ->> 'page')::int as page,
    ue.data
  from user_events ue
  join selected_result_sets selected
    on selected.result_set_id = ue.data ->> 'resultSetId'
  where ue.name = $4
    and ue.ts >= date_to_midnight_pt($1::date) - interval '24 hours'
    and ue.ts < case
      when $2::date is null then $7::timestamptz
      else date_to_midnight_pt($2::date) + interval '30 minutes'
    end
),
page_items as (
  select
    page.ts,
    page.result_set_id,
    item ->> 'id' as item_id,
    item ->> 'itemType' as item_type,
    item ->> 'matchType' as match_type
  from result_pages page
  cross join lateral jsonb_array_elements(
    coalesce(page.data -> 'items', '[]'::jsonb)
  ) as result_item(item)
),
item_availability as (
  select
    result_set_id,
    item_id,
    item_type,
    min(ts) as first_loaded_ts
  from page_items
  group by result_set_id, item_id, item_type
),
exposure_items as (
  select
    presentation.presentation_id,
    item ->> 'id' as item_id,
    item ->> 'itemType' as item_type,
    (item ->> 'rank')::int as rank,
    item ->> 'matchType' as match_type
  from presentations presentation
  cross join lateral jsonb_array_elements(
    coalesce(presentation.data -> 'items', '[]'::jsonb)
  ) as exposure_item(item)
),
candidate_item_availability as (
  select
    presentation.presentation_id,
    item.item_id,
    item.item_type,
    presentation.ts as available_ts
  from presentations presentation
  join exposure_items item using (presentation_id)
  union all
  select
    presentation.presentation_id,
    item.item_id,
    item.item_type,
    greatest(item.first_loaded_ts, presentation.ts) as available_ts
  from presentations presentation
  join item_availability item using (result_set_id)
),
presentation_item_availability as (
  select
    presentation_id,
    item_id,
    item_type,
    min(available_ts) as available_ts
  from candidate_item_availability
  group by presentation_id, item_id, item_type
),
click_rollup as (
  select
    presentation.presentation_id,
    count(*) filter (
      where click.data ->> 'itemType' = 'market'
    ) as market_clicks,
    count(*) filter (
      where click.data ->> 'itemType' = 'post'
    ) as post_clicks,
    count(*) filter (
      where click.data ->> 'matchType' = 'semantic'
    ) as semantic_clicks
  from presentations presentation
  left join user_events click
    on click.name = $5
   and click.data ->> 'presentationId' = presentation.presentation_id
   -- Exposure/click inserts are fire-and-forget and can arrive out of order.
   and click.ts >= presentation.ts - interval '5 seconds'
   and click.ts < presentation.ts + interval '30 minutes'
   and click.ts >= date_to_midnight_pt($1::date) - interval '5 seconds'
   and click.ts < case
     when $2::date is null then $7::timestamptz + interval '30 minutes'
     else date_to_midnight_pt($2::date) + interval '30 minutes'
   end
  group by presentation.presentation_id
),
action_candidates as (
  select
    interaction.id as action_id,
    presentation.presentation_id,
    row_number() over (
      partition by interaction.id
      order by presentation.ts desc
    ) as attribution_order
  from user_contract_interactions interaction
  join presentations presentation
    on presentation.user_id = interaction.user_id
   and presentation.ts <= interaction.created_time + interval '5 seconds'
   and presentation.ts > interaction.created_time - interval '30 minutes'
  join presentation_item_availability item
    on item.presentation_id = presentation.presentation_id
   and item.item_type = 'market'
   and item.item_id = interaction.contract_id
   and item.available_ts <= interaction.created_time + interval '5 seconds'
  where interaction.name in (
    'page bet',
    'page comment',
    'page repost',
    'page like',
    'page share'
  )
),
action_rollup as (
  select presentation_id, count(*) as actions
  from action_candidates
  where attribution_order = 1
  group by presentation_id
),
prior_seen_rollup as (
  select
    presentation.presentation_id,
    count(*) filter (where item.rank <= 10) as top_ten_markets,
    count(*) filter (
      where item.rank <= 10
        and exists (
          select 1
          from user_view_events view_event
          where view_event.user_id = presentation.user_id
            and view_event.contract_id = item.item_id
            and view_event.name in ('card', 'page')
            and view_event.created_time
                >= presentation.ts - interval '7 days'
            and view_event.created_time
                < presentation.ts - interval '1 hour'
        )
    ) as previously_seen_top_ten
  from presentations presentation
  join exposure_items item
    on item.presentation_id = presentation.presentation_id
   and item.item_type = 'market'
  where presentation.user_id is not null
  group by presentation.presentation_id
),
per_presentation as (
  select
    presentation.ts,
    presentation.subject_id,
    presentation.user_id,
    presentation.presentation_id,
    presentation.result_set_id,
    presentation.segment,
    presentation.variant,
    presentation.assignment_source,
    presentation.market_count,
    presentation.post_count,
    presentation.semantic_count,
    presentation.initial_latency_ms,
    presentation.compatibility_fallback,
    (coalesce(click.market_clicks, 0) > 0)::int as market_clicked,
    (coalesce(click.post_clicks, 0) > 0)::int as post_clicked,
    (coalesce(click.semantic_clicks, 0) > 0)::int as semantic_clicked,
    case
      when presentation.user_id is null then null
      else (coalesce(action.actions, 0) > 0)::int
    end as meaningfully_acted,
    case
      when prior_seen.top_ten_markets > 0
      then prior_seen.previously_seen_top_ten::numeric
        / prior_seen.top_ten_markets
    end as prior_seen_top_ten_rate
  from presentations presentation
  left join click_rollup click using (presentation_id)
  left join action_rollup action using (presentation_id)
  left join prior_seen_rollup prior_seen using (presentation_id)
)
`

const scorecardSql = `${analysisCtes}
select
  segment,
  variant,
  count(*)::int as presentations,
  count(distinct result_set_id)::int as result_sets,
  count(distinct subject_id)::int as subjects,
  round(avg(market_clicked), 4) as market_ctr,
  round(avg(meaningfully_acted), 4) as meaningful_action_rate,
  round(avg(post_clicked) filter (where post_count > 0), 4) as post_ctr,
  round(
    avg(semantic_clicked) filter (where semantic_count > 0),
    4
  ) as semantic_tail_ctr,
  round(avg((market_count = 0)::int), 4) as zero_market_rate,
  round(avg(market_count), 2) as avg_markets_presented,
  round(avg(prior_seen_top_ten_rate), 4) as prior_seen_top_ten_rate,
  round(
    percentile_cont(0.95)
      within group (order by initial_latency_ms)::numeric,
    0
  ) as p95_initial_latency_ms,
  round(avg(compatibility_fallback::int), 4)
    as compatibility_fallback_rate
from per_presentation
group by segment, variant
order by segment, variant
`

const subjectLiftSql = `${analysisCtes},
subject_metrics as (
  select
    segment,
    variant,
    subject_id,
    avg(market_clicked::numeric) as market_ctr,
    avg(meaningfully_acted::numeric) as meaningful_action_rate,
    avg((market_count = 0)::int::numeric) as zero_market_rate
  from per_presentation
  where segment in ('for-you', 'text-search-low-hit')
    -- Anonymous assignment intentionally changes to an immutable user-based
    -- assignment after login. Keep those correlated device/user observations
    -- out of the causal estimate; they remain visible in the scorecard.
    and user_id is not null
    and assignment_source = 'user-hash'
  group by segment, variant, subject_id
),
subject_metric_values as (
  select
    subject.segment,
    subject.variant,
    metric.metric,
    metric.desired_direction,
    metric.value
  from subject_metrics subject
  cross join lateral (
    values
      ('market CTR', 'higher', subject.market_ctr),
      ('meaningful action rate', 'higher', subject.meaningful_action_rate),
      ('zero-market rate', 'lower', subject.zero_market_rate)
  ) as metric(metric, desired_direction, value)
  where metric.value is not null
),
arm_statistics as (
  select
    segment,
    variant,
    metric,
    desired_direction,
    count(*)::int as subjects,
    avg(value) as rate,
    var_samp(value) as variance
  from subject_metric_values
  group by segment, variant, metric, desired_direction
),
comparison as (
  select
    segment,
    metric,
    desired_direction,
    max(subjects) filter (where variant = 'control') as control_subjects,
    max(subjects) filter (where variant = 'treatment') as treatment_subjects,
    max(rate) filter (where variant = 'control') as control_rate,
    max(rate) filter (where variant = 'treatment') as treatment_rate,
    max(variance) filter (where variant = 'control') as control_variance,
    max(variance) filter (where variant = 'treatment') as treatment_variance
  from arm_statistics
  group by segment, metric, desired_direction
),
with_standard_error as (
  select
    *,
    sqrt(
      treatment_variance / nullif(treatment_subjects, 0)
      + control_variance / nullif(control_subjects, 0)
    ) as standard_error
  from comparison
)
select
  segment,
  metric,
  desired_direction,
  control_subjects::int,
  treatment_subjects::int,
  round(control_rate, 4) as control_rate,
  round(treatment_rate, 4) as treatment_rate,
  round(treatment_rate - control_rate, 4) as absolute_lift,
  round((treatment_rate - control_rate) / nullif(control_rate, 0), 4)
    as relative_lift,
  round(treatment_rate - control_rate - 1.96 * standard_error, 4)
    as ci_95_low,
  round(treatment_rate - control_rate + 1.96 * standard_error, 4)
    as ci_95_high
from with_standard_error
where control_subjects is not null and treatment_subjects is not null
order by segment, metric
`

const requestLiftSql = `${analysisCtes},
fresh_requests as (
  select distinct on (ue.data ->> 'requestAttemptId')
    ue.ts,
    ue.user_id,
    'user:' || ue.user_id as subject_id,
    ue.data ->> 'requestAttemptId' as request_attempt_id,
    ue.data ->> 'resultSetId' as result_set_id,
    ue.data ->> 'variant' as variant,
    ue.data ->> 'surface' as surface
  from user_events ue
  left join users u on u.id = ue.user_id
  where ue.name = $8
    and ue.ts >= date_to_midnight_pt($1::date)
    and ue.ts < case
      -- Give a request one minute to render, then measure actions for 30
      -- minutes from that presentation. Requests without a presentation in
      -- that minute remain in the ITT denominator as zero engagement.
      when $2::date is null then $7::timestamptz - interval '31 minutes'
      else least(
        date_to_midnight_pt($2::date) - interval '1 minute',
        $7::timestamptz - interval '31 minutes'
      )
    end
    and ue.user_id is not null
    and ue.data ->> 'requestAttemptId' is not null
    and ue.data ->> 'resultSetId' is not null
    and ue.data ->> 'variant' in ('control', 'treatment')
    and ue.data ->> 'assignmentSource' = 'user-hash'
    and ue.data ->> 'sourceComponent' = 'search'
    and ue.data ->> 'surface' in ('for-you', 'text-search')
    and coalesce((ue.data ->> 'isFresh')::boolean, false)
    and ue.user_id not in ($6:list)
    and coalesce(u.is_bot, false) = false
  order by ue.data ->> 'requestAttemptId', ue.ts
),
request_presentations as (
  select distinct on (request.request_attempt_id)
    request.subject_id,
    request.variant,
    request.surface,
    request.request_attempt_id,
    presentation.presentation_id,
    presentation.market_count,
    presentation.market_clicked,
    presentation.meaningfully_acted
  from fresh_requests request
  left join per_presentation presentation
    on presentation.result_set_id = request.result_set_id
   and presentation.user_id = request.user_id
   and presentation.ts >= request.ts - interval '5 seconds'
   and presentation.ts < request.ts + interval '1 minute'
  order by request.request_attempt_id, presentation.ts
),
request_subject_metrics as (
  select
    case
      when surface = 'for-you' then 'for-you-itt'
      else 'text-search-all-itt'
    end as segment,
    variant,
    subject_id,
    avg(coalesce(market_clicked, 0)::numeric) as market_ctr,
    avg(coalesce(meaningfully_acted, 0)::numeric)
      as meaningful_action_rate,
    avg((presentation_id is not null)::int::numeric) as render_rate,
    avg((coalesce(market_count, 0) = 0)::int::numeric) as zero_market_rate
  from request_presentations
  group by segment, variant, subject_id
),
request_metric_values as (
  select
    subject.segment,
    subject.variant,
    metric.metric,
    metric.decision_role,
    metric.desired_direction,
    metric.value
  from request_subject_metrics subject
  cross join lateral (
    values
      (
        'market CTR',
        case when subject.segment = 'text-search-all-itt'
          then 'primary' else 'secondary' end,
        'higher',
        subject.market_ctr
      ),
      (
        'meaningful action rate',
        case when subject.segment = 'for-you-itt'
          then 'primary' else 'secondary' end,
        'higher',
        subject.meaningful_action_rate
      ),
      ('render rate', 'reliability guardrail', 'higher', subject.render_rate),
      ('zero-market rate', 'mechanism', 'lower', subject.zero_market_rate)
  ) as metric(metric, decision_role, desired_direction, value)
),
request_arm_statistics as (
  select
    segment,
    variant,
    metric,
    decision_role,
    desired_direction,
    count(*)::int as subjects,
    avg(value) as rate,
    var_samp(value) as variance
  from request_metric_values
  group by segment, variant, metric, decision_role, desired_direction
),
request_comparison as (
  select
    segment,
    metric,
    decision_role,
    desired_direction,
    max(subjects) filter (where variant = 'control') as control_subjects,
    max(subjects) filter (where variant = 'treatment') as treatment_subjects,
    max(rate) filter (where variant = 'control') as control_rate,
    max(rate) filter (where variant = 'treatment') as treatment_rate,
    max(variance) filter (where variant = 'control') as control_variance,
    max(variance) filter (where variant = 'treatment') as treatment_variance
  from request_arm_statistics
  group by segment, metric, decision_role, desired_direction
),
request_with_standard_error as (
  select
    *,
    sqrt(
      treatment_variance / nullif(treatment_subjects, 0)
      + control_variance / nullif(control_subjects, 0)
    ) as standard_error
  from request_comparison
)
select
  segment,
  metric,
  decision_role,
  desired_direction,
  control_subjects::int,
  treatment_subjects::int,
  round(control_rate, 4) as control_rate,
  round(treatment_rate, 4) as treatment_rate,
  round(treatment_rate - control_rate, 4) as absolute_lift,
  round((treatment_rate - control_rate) / nullif(control_rate, 0), 4)
    as relative_lift,
  round(treatment_rate - control_rate - 1.96 * standard_error, 4)
    as ci_95_low,
  round(treatment_rate - control_rate + 1.96 * standard_error, 4)
    as ci_95_high
from request_with_standard_error
where control_subjects is not null and treatment_subjects is not null
order by segment, decision_role, metric
`

const resultHealthSql = `${analysisCtes},
first_presentation_per_result_set as (
  select distinct on (result_set_id)
    presentation.result_set_id,
    presentation.segment,
    presentation.variant,
    coalesce(compatibility.used_compatibility_fallback, false)
      as compatibility_fallback
  from presentations presentation
  -- This diagnostic intentionally includes only result sets whose response
  -- event is inside the bounded lookup window. Causal fields live directly
  -- on the exposure event and do not depend on this join.
  join result_set_compatibility compatibility using (result_set_id)
  order by presentation.result_set_id, presentation.ts
),
result_set_items as (
  select
    result_set_id,
    count(*) filter (where item_type = 'market') as markets_loaded,
    count(distinct item_id) filter (where item_type = 'market')
      as distinct_markets_loaded
  from page_items
  group by result_set_id
),
result_set_health as (
  select
    first.segment,
    first.variant,
    first.result_set_id,
    first.compatibility_fallback,
    coalesce(items.markets_loaded, 0) as markets_loaded,
    coalesce(items.distinct_markets_loaded, 0) as distinct_markets_loaded
  from first_presentation_per_result_set first
  left join result_set_items items using (result_set_id)
)
select
  segment,
  variant,
  count(*)::int as result_sets,
  round(avg(markets_loaded), 2) as avg_markets_loaded,
  round(avg(distinct_markets_loaded), 2) as avg_distinct_markets_loaded,
  round(
    avg(
      case
        when markets_loaded > 0
        then 1 - distinct_markets_loaded::numeric / markets_loaded
      end
    ),
    4
  ) as duplicate_rate,
  round(avg(compatibility_fallback::int), 4)
    as compatibility_fallback_rate
from result_set_health
group by segment, variant
order by segment, variant
`

const numberOrNull = (value: unknown) =>
  value === null || value === undefined ? null : Number(value)

runScript(async ({ pg: database }) => {
  await database.tx({ mode: READ_ONLY_REPEATABLE_MODE }, async (pg) => {
    // Every statement must fail closed instead of putting sustained load on
    // the primary database if the event volume or query plan surprises us.
    await pg.none("set local statement_timeout = '60s'")

    const params = [
      start,
      end ?? null,
      DISCOVERY_EXPOSURE_EVENT,
      DISCOVERY_RESULTS_EVENT,
      DISCOVERY_RESULT_CLICK_EVENT,
      ENV_CONFIG.adminIds,
      reportEndTime,
      DISCOVERY_SEARCH_REQUEST_EVENT,
    ]
    const scorecard = await pg.map<ScorecardRow>(
      scorecardSql,
      params,
      (row) => ({
        ...row,
        presentations: Number(row.presentations),
        result_sets: Number(row.result_sets),
        subjects: Number(row.subjects),
        market_ctr: numberOrNull(row.market_ctr),
        meaningful_action_rate: numberOrNull(row.meaningful_action_rate),
        post_ctr: numberOrNull(row.post_ctr),
        semantic_tail_ctr: numberOrNull(row.semantic_tail_ctr),
        zero_market_rate: numberOrNull(row.zero_market_rate),
        avg_markets_presented: numberOrNull(row.avg_markets_presented),
        prior_seen_top_ten_rate: numberOrNull(row.prior_seen_top_ten_rate),
        p95_initial_latency_ms: numberOrNull(row.p95_initial_latency_ms),
        compatibility_fallback_rate: numberOrNull(
          row.compatibility_fallback_rate
        ),
      })
    )

    console.log(
      `Discovery v1 scorecard: ${start} to ${
        end ?? '30 minutes before this run'
      } (PT)`
    )
    console.log('Main Browse only; forced accounts, admins, and bots excluded.')
    console.table(scorecard)

    const requestLifts = await pg.map<RequestLiftRow>(
      requestLiftSql,
      params,
      (row) => ({
        ...row,
        control_subjects: Number(row.control_subjects),
        treatment_subjects: Number(row.treatment_subjects),
        control_rate: numberOrNull(row.control_rate),
        treatment_rate: numberOrNull(row.treatment_rate),
        absolute_lift: numberOrNull(row.absolute_lift),
        relative_lift: numberOrNull(row.relative_lift),
        ci_95_low: numberOrNull(row.ci_95_low),
        ci_95_high: numberOrNull(row.ci_95_high),
      })
    )

    console.log('\nSigned-in request-level intent-to-treat comparisons')
    console.log(
      'Primary: For You meaningful-action rate; all-text-search market CTR.'
    )
    console.log(
      'Every fresh request is retained; no presentation counts as zero engagement.'
    )
    console.table(requestLifts)

    const lifts = await pg.map<LiftRow>(subjectLiftSql, params, (row) => ({
      ...row,
      control_subjects: Number(row.control_subjects),
      treatment_subjects: Number(row.treatment_subjects),
      control_rate: numberOrNull(row.control_rate),
      treatment_rate: numberOrNull(row.treatment_rate),
      absolute_lift: numberOrNull(row.absolute_lift),
      relative_lift: numberOrNull(row.relative_lift),
      ci_95_low: numberOrNull(row.ci_95_low),
      ci_95_high: numberOrNull(row.ci_95_high),
    }))

    console.log('\nPresentation-conditional mechanism comparisons')
    console.log(
      'A 95% interval crossing zero is inconclusive, not evidence of no effect.'
    )
    console.table(lifts)

    const resultHealth = await pg.map<ResultHealthRow>(
      resultHealthSql,
      params,
      (row) => ({
        ...row,
        result_sets: Number(row.result_sets),
        avg_markets_loaded: numberOrNull(row.avg_markets_loaded),
        avg_distinct_markets_loaded: numberOrNull(
          row.avg_distinct_markets_loaded
        ),
        duplicate_rate: numberOrNull(row.duplicate_rate),
        compatibility_fallback_rate: numberOrNull(
          row.compatibility_fallback_rate
        ),
      })
    )

    console.log('\nResult-set pagination health')
    console.table(resultHealth)

    const reliability = await pg.map<ReliabilityRow>(
      `with requests as (
       select distinct on (ue.data ->> 'requestAttemptId')
         ue.ts,
         ue.user_id,
         ue.data ->> 'requestAttemptId' as request_attempt_id,
         ue.data ->> 'variant' as variant,
         ue.data ->> 'assignmentSource' as assignment_source,
         ue.data ->> 'surface' as surface,
         case
           when coalesce((ue.data ->> 'isFresh')::boolean, false)
             then 'fresh'
           else 'load-more'
         end as request_stage
       from user_events ue
       where ue.name = $1
         and ue.data ->> 'requestAttemptId' is not null
         and ue.ts >= date_to_midnight_pt($5::date)
         and ue.ts < case
           -- Do not label a currently in-flight request as missing.
           when $6::date is null
             then $8::timestamptz - interval '1 minute'
           else least(
             date_to_midnight_pt($6::date),
             $8::timestamptz - interval '1 minute'
           )
         end
         and ue.data ->> 'sourceComponent' = 'search'
       order by ue.data ->> 'requestAttemptId', ue.ts
     ), eligible_requests as (
       select
         request.*
       from requests request
       left join users u on u.id = request.user_id
       where request.variant in ('control', 'treatment')
         and request.assignment_source <> 'forced'
         and (request.user_id is null or request.user_id not in ($7:list))
         and coalesce(u.is_bot, false) = false
     ), outcomes as (
       select
         request.request_attempt_id,
         bool_or(event.name = $2) as succeeded,
         bool_or(event.name = $3) as terminal_error,
         bool_or(event.name = $4) as client_aborted,
         max((event.data ->> 'latencyMs')::numeric)
           filter (where event.name = $2) as success_latency_ms,
         max((event.data ->> 'latencyMs')::numeric)
           filter (where event.name = $3) as error_latency_ms
       from eligible_requests request
       left join user_events event
         on event.data ->> 'requestAttemptId' = request.request_attempt_id
        and event.name in ($2, $3, $4)
        and event.ts >= date_to_midnight_pt($5::date) - interval '5 seconds'
        and event.ts < case
          when $6::date is null
            then $8::timestamptz + interval '30 minutes'
          else date_to_midnight_pt($6::date) + interval '30 minutes'
        end
       group by request.request_attempt_id
     )
     select
       request.surface,
       request.assignment_source,
       request.variant,
       request.request_stage,
       count(*)::int as attempts,
       count(*) filter (where outcome.succeeded)::int as successes,
       count(*) filter (where outcome.terminal_error)::int as terminal_errors,
       count(*) filter (where outcome.client_aborted)::int as client_aborts,
       count(*) filter (
         where not coalesce(outcome.succeeded, false)
           and not coalesce(outcome.terminal_error, false)
           and not coalesce(outcome.client_aborted, false)
       )::int as missing_outcomes,
       round(avg(coalesce(outcome.succeeded, false)::int), 4) as success_rate,
       round(avg(coalesce(outcome.terminal_error, false)::int), 4)
         as error_rate,
       round(avg(coalesce(outcome.client_aborted, false)::int), 4)
         as abort_rate,
       round(
         percentile_cont(0.95)
           within group (order by outcome.success_latency_ms)::numeric,
         0
       ) as p95_success_latency_ms,
       round(
         percentile_cont(0.95)
           within group (order by outcome.error_latency_ms)::numeric,
         0
       ) as p95_terminal_error_latency_ms
     from eligible_requests request
     left join outcomes outcome using (request_attempt_id)
     group by
       request.surface,
       request.assignment_source,
       request.variant,
       request.request_stage
     order by
       request.surface,
       request.assignment_source,
       request.variant,
       request.request_stage`,
      [
        DISCOVERY_SEARCH_REQUEST_EVENT,
        DISCOVERY_RESULTS_EVENT,
        DISCOVERY_SEARCH_ERROR_EVENT,
        DISCOVERY_SEARCH_ABORT_EVENT,
        start,
        end ?? null,
        ENV_CONFIG.adminIds,
        reportEndTime,
      ],
      (row) => ({
        ...row,
        attempts: Number(row.attempts),
        successes: Number(row.successes),
        terminal_errors: Number(row.terminal_errors),
        client_aborts: Number(row.client_aborts),
        missing_outcomes: Number(row.missing_outcomes),
        success_rate: numberOrNull(row.success_rate),
        error_rate: numberOrNull(row.error_rate),
        abort_rate: numberOrNull(row.abort_rate),
        p95_success_latency_ms: numberOrNull(row.p95_success_latency_ms),
        p95_terminal_error_latency_ms: numberOrNull(
          row.p95_terminal_error_latency_ms
        ),
      })
    )

    console.log('\nRequest lifecycle reliability guardrail')
    console.log(
      'Missing outcomes are reported separately and may be discarded stale responses.'
    )
    console.table(reliability)

    const srm = await pg.map<{
      assignment_source: string
      control_subjects: number
      treatment_subjects: number
      chi_square: number | null
      passes_5_percent_srm_check: boolean
    }>(
      `with assignment_requests as (
       select
         ue.ts,
         ue.user_id,
         ue.data ->> 'deviceId' as device_id,
         ue.data ->> 'assignmentSource' as assignment_source,
         ue.data ->> 'variant' as variant
       from user_events ue
       left join users u on u.id = ue.user_id
       where ue.name = $1
         and ue.ts >= date_to_midnight_pt($2::date)
         and ue.ts < case
           when $3::date is null then $5::timestamptz
           else date_to_midnight_pt($3::date)
         end
         and ue.data ->> 'assignmentSource' in ('user-hash', 'device-hash')
         and ue.data ->> 'sourceComponent' = 'search'
         and (ue.user_id is null or ue.user_id not in ($4:list))
         and coalesce(u.is_bot, false) = false
     ), first_assignment as (
       select distinct on (
         assignment_source,
         case assignment_source
           when 'user-hash' then 'user:' || user_id
           else 'device:' || device_id
         end
       )
         assignment_source,
         case assignment_source
           when 'user-hash' then 'user:' || user_id
           else 'device:' || device_id
         end as subject_id,
         variant
       from assignment_requests
       where (assignment_source = 'user-hash' and user_id is not null)
          or (assignment_source = 'device-hash' and device_id is not null)
       order by assignment_source, subject_id, ts
     ), counts as (
       select
         assignment_source,
         count(*) filter (where variant = 'control')::int
           as control_subjects,
         count(*) filter (where variant = 'treatment')::int
           as treatment_subjects
       from first_assignment
       group by assignment_source
     ), result as (
       select
         *,
         power(control_subjects - treatment_subjects, 2)::numeric
           / nullif(control_subjects + treatment_subjects, 0) as chi_square
       from counts
     )
     select
       *,
       coalesce(chi_square <= 3.841, false) as passes_5_percent_srm_check
     from result
     order by assignment_source`,
      [
        DISCOVERY_SEARCH_REQUEST_EVENT,
        start,
        end ?? null,
        ENV_CONFIG.adminIds,
        reportEndTime,
      ],
      (row) => ({
        ...row,
        control_subjects: Number(row.control_subjects),
        treatment_subjects: Number(row.treatment_subjects),
        chi_square: numberOrNull(row.chi_square),
      })
    )

    console.log('\n50/50 sample-ratio checks (chi-square threshold 3.841)')
    console.log('The user-hash row is the primary-analysis population.')
    console.table(srm)

    const forcedIds = Object.keys(AB_TEST_ACCOUNT_OVERRIDES)
    const forcedAccounts = await pg.manyOrNone<{
      username: string
      variant: string
      assignment_source: string
      presentations: number
      latest_presentation: string
    }>(
      `select
       u.username,
       ue.data ->> 'variant' as variant,
       ue.data ->> 'assignmentSource' as assignment_source,
       count(*)::int as presentations,
       max(ue.ts)::text as latest_presentation
     from user_events ue
     join users u on u.id = ue.user_id
     where ue.name = $1
       and ue.user_id in ($2:list)
       and ue.ts >= date_to_midnight_pt($3::date)
       and ue.ts < case
         when $4::date is null then $5::timestamptz
         else date_to_midnight_pt($4::date)
       end
       and ue.data ->> 'sourceComponent' = 'search'
     group by u.username, variant, assignment_source
     order by u.username`,
      [DISCOVERY_EXPOSURE_EVENT, forcedIds, start, end ?? null, reportEndTime]
    )

    console.log('\nForced QA accounts (excluded above)')
    console.table(forcedAccounts)

    const crossArmSubjects = await pg.manyOrNone<{
      subject_id: string
      variants: string[]
    }>(
      `with assignments as (
       select
         case
           when user_id is not null then 'user:' || user_id
           else 'device:' || (data ->> 'deviceId')
         end as subject_id,
         data ->> 'variant' as variant
       from user_events
       where name = $1
         and ts >= date_to_midnight_pt($2::date)
         and ts < case
           when $3::date is null then $4::timestamptz
           else date_to_midnight_pt($3::date)
         end
         and data ->> 'assignmentSource' <> 'forced'
         and data ->> 'sourceComponent' = 'search'
     )
     select subject_id, array_agg(distinct variant) as variants
     from assignments
     group by subject_id
     having count(distinct variant) > 1`,
      [DISCOVERY_EXPOSURE_EVENT, start, end ?? null, reportEndTime]
    )

    console.log(
      `\nCross-arm assignment subjects (expected 0): ${crossArmSubjects.length}`
    )
    if (crossArmSubjects.length) console.table(crossArmSubjects)

    const crossArmDevices = await pg.manyOrNone<{
      device_id: string
      variants: string[]
    }>(
      `select
       data ->> 'deviceId' as device_id,
       array_agg(distinct data ->> 'variant') as variants
     from user_events
     where name = $1
       and ts >= date_to_midnight_pt($2::date)
       and ts < case
         when $3::date is null then $4::timestamptz
         else date_to_midnight_pt($3::date)
       end
       and data ->> 'assignmentSource' <> 'forced'
       and data ->> 'sourceComponent' = 'search'
       and data ->> 'deviceId' is not null
     group by data ->> 'deviceId'
     having count(distinct data ->> 'variant') > 1`,
      [DISCOVERY_EXPOSURE_EVENT, start, end ?? null, reportEndTime]
    )

    console.log(
      `Cross-arm devices after login/account changes (contamination diagnostic): ${crossArmDevices.length}`
    )
    if (crossArmDevices.length) console.table(crossArmDevices.slice(0, 20))
  })
})
