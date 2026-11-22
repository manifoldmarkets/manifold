import {
  MAX_ATTENTION_TIME,
  parseSportsAttentionCursor,
  SPORTS_ATTENTION_DEFAULT_LIMIT,
  SPORTS_ATTENTION_MAX_LIMIT,
  SportsAttentionItem,
  SportsAttentionPage,
} from 'common/bdl/attention'
import {
  BDL_CANCELLATION_HOLD_MS,
  BDL_OVERDUE_ALERT_MS,
} from 'common/bdl/constants'
import { BDL_LEAGUE_KEYS } from 'common/bdl/leagues'
import { contractPath } from 'common/contract'
import {
  F1_ATTENTION_AFTER_MS,
  F1_CANCEL_CONFIRM_HOURS,
  F1_CLOSE_BUFFER_HOURS,
  F1_POSTPONED_ATTENTION_MS,
  F1_RESOLVE_DELAY_HOURS,
} from 'common/f1-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { HOUR_MS } from 'common/util/time'
import type { SupabaseDirectClient } from '../supabase/init'
import { sportsProviderSql } from '../supabase/sports-provider'

type Row = Omit<SportsAttentionItem, 'href'> & {
  creatorUsername: string | null
  slug: string | null
  correctionTime: number | null
}
type Query = { limit?: number; cursor?: string }

// These fields are stored as JSON numbers in epoch milliseconds. A CASE guards
// the cast even if the planner reorders the surrounding WHERE conditions.
function storedMs(
  key:
    | 'sportsAttentionSince'
    | 'sportsFinalSince'
    | 'sportsCanceledSince'
    | 'sportsResumptionTime'
) {
  return `case when jsonb_typeof(c.data->'${key}') = 'number'
    and c.data->>'${key}' ~ '^[1-9][0-9]{0,15}$' then (c.data->>'${key}')::bigint end`
}

// A session market does not store its type. Use the longest supported session
// before declaring the classification missing, including when trading closed early.
const f1SessionMs =
  (Math.max(...Object.values(F1_CLOSE_BUFFER_HOURS)) + F1_RESOLVE_DELAY_HOURS) *
  HOUR_MS

export async function getSportsAttention(
  pg: SupabaseDirectClient,
  { limit = SPORTS_ATTENTION_DEFAULT_LIMIT, cursor }: Query = {},
  now = Date.now()
): Promise<SportsAttentionPage> {
  const after = cursor === undefined ? null : parseSportsAttentionCursor(cursor)
  if (
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    now > MAX_ATTENTION_TIME ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > SPORTS_ATTENTION_MAX_LIMIT ||
    (cursor !== undefined && (!after || after.asOf > now))
  )
    throw new Error('Invalid sports attention query')
  const asOf = after?.asOf ?? now
  const rows = await pg.manyOrNone<Row>(
    `with official as (
      select c.id, left(c.question, 500) as question, c.slug, c.data->>'creatorUsername' as username,
        c.data->>'sportsEventId' as event, ${sportsProviderSql()} as provider,
        c.data->>'sportsMarketType' as kind, c.data->>'sportsLeagueKey' as league_key,
        left(c.data->>'sportsLeague',100) as league, upper(coalesce(c.data->>'sportsLiveStatus','')) as status,
        case when jsonb_typeof(c.data->'sportsAttentionReason')='string' then
          nullif(left(btrim(regexp_replace(c.data->>'sportsAttentionReason','[[:space:][:cntrl:]]+',' ','g')), 500),'') end as reason,
        ${storedMs('sportsAttentionSince')} as marked, ${storedMs(
      'sportsFinalSince'
    )} as final_at,
        ${storedMs('sportsCanceledSince')} as canceled_at, ${storedMs(
      'sportsResumptionTime'
    )} as resumes,
        case when c.close_time > 'epoch' and c.close_time <= timestamptz '275760-09-13 00:00:00+00'
          then floor(extract(epoch from c.close_time) * 1000)::bigint end as close_ms,
        c.data->>'sportsStartTimestamp' as start_text,
        case when c.resolution is not null then watch.corrected_ms end as correction_ms
      from contracts c
      cross join lateral (select case
        when jsonb_typeof(c.data#>'{sportsF1Watch,correctedTime}')='number'
          and c.data#>>'{sportsF1Watch,correctedTime}' ~ '^[1-9][0-9]{0,15}$'
        then (c.data#>>'{sportsF1Watch,correctedTime}')::bigint end as corrected_ms) watch
      where c.creator_id = any($1) and c.token='MANA' and c.visibility='public'
        and (c.resolution is null or (c.resolution <> 'CANCEL'
          and c.data->>'sportsEventId' ~ '^bdl-f1:[1-9][0-9]*:[1-9][0-9]*$'
          and c.data#>>'{sportsF1Watch,eventId}' = c.data->>'sportsEventId'
          and c.data#>'{sportsF1Watch,resolutionTime}' = to_jsonb((extract(epoch from c.resolution_time)*1000)::bigint)
          and coalesce(c.data->>'sportsProvider','bdl')='bdl'
          and coalesce(c.data->>'sportsLeagueKey','f1')='f1'
          and c.data->>'sportsMarketType' in ('winner','podium')
          and watch.corrected_ms between (extract(epoch from c.resolution_time)*1000)::bigint and $2
          and nullif(trim(c.data->>'sportsAttentionReason'),'') is not null))
        and c.deleted is not true
        and c.id ~ '^[a-zA-Z0-9_-]{1,128}$'
        and c.data->>'sportsFixture' is distinct from 'true'
        and not starts_with(coalesce(c.data->>'sportsEventId',''),'fixture:')
        and (c.data ? 'sportsAttentionReason' or c.close_time < $3::timestamptz)
    ), events as (
      select *, event ~ '^bdl-f1:[1-9][0-9]*:[1-9][0-9]*$' as f1_session,
        event ~ '^bdl-f1-title:[0-9]{4}:(drivers|constructors)$' as f1_title
      from official where provider <> 'fixture'
    ), deadlines as (
      select *, case
        when f1_session then
          -- The safe JSON datetime parser returns NULL for invalid civil dates.
          -- It accepts numeric offsets including +00:00 for UTC.
          case when start_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'
            then (extract(epoch from
              (jsonb_path_query_first_tz(to_jsonb(replace(start_text,'Z','+00:00')), '$.datetime()', '{}', true) #>> '{}')::timestamptz
            ) * 1000)::bigint end end as f1_start,
        case when canceled_at between 1 and $2 and status in ('','CANCELED','CANCELLED')
          then canceled_at + case when f1_session then ${
            F1_CANCEL_CONFIRM_HOURS * HOUR_MS
          }
            else ${BDL_CANCELLATION_HOLD_MS} end end as cancel_due
      from events
      -- A recorded incident can itself be a missing or reissued event ID.
      where (reason is not null and (
               provider in ('odds','bdl','football-data') or league_key=any($7)
               or (nullif(btrim(league),'') is not null and kind in ('moneyline','spread','total','prop','winner','podium','title'))))
         or (provider='odds' and event ~ '^odds:[^:]+:.+$')
         or (provider='football-data' and event ~ '^fd-[1-9][0-9]*$')
         or (provider='bdl' and (f1_session or f1_title or
              (event ~ '^bdl:[a-z0-9/]+:[1-9][0-9]{0,15}(:[a-zA-Z0-9][a-zA-Z0-9_-]*)?$'
               and split_part(event,':',2)=any($7) and split_part(event,':',2)<>'f1'
               and case when split_part(event,':',3) ~ '^[1-9][0-9]{0,15}$'
                 then split_part(event,':',3)::bigint <= ${
                   Number.MAX_SAFE_INTEGER
                 } end
               and case when split_part(event,':',2) in ('atp','wta','mma') then
                 case when split_part(event,':',4) ~ '^[1-9][0-9]{0,15}-[1-9][0-9]{0,15}$' then
                   split_part(split_part(event,':',4),'-',1)::bigint < split_part(split_part(event,':',4),'-',2)::bigint
                   and split_part(split_part(event,':',4),'-',2)::bigint <= ${
                     Number.MAX_SAFE_INTEGER
                   } end
                 else true end)))
    ), incidents as (
      select *, case when reason is not null then
        case when marked between 1 and $2 then marked end
        else greatest(close_ms + ${BDL_OVERDUE_ALERT_MS}, cancel_due,
          case when f1_session then
            greatest(f1_start + ${f1SessionMs}, close_ms + ${
      F1_RESOLVE_DELAY_HOURS * HOUR_MS
    })
            + case when status='POSTPONED' then ${F1_POSTPONED_ATTENTION_MS} else ${F1_ATTENTION_AFTER_MS} end end)
        end as since
      from deadlines
      where reason is not null or (
        close_ms is not null
        and not f1_title and (kind is null or kind in ('moneyline','spread','total','prop','winner','podium'))
        and (not f1_session or f1_start is not null)
        and status not in ('FINAL','FINISHED','AWARDED')
        and (final_at is null or final_at > $2)
        and not ((event like 'bdl:mlb:%' or event like 'odds:baseball_mlb:%' or
          (event !~ ':' and coalesce(league_key='mlb',false))) and status='SUSPENDED'
          and coalesce(resumes > $2 and resumes <= ${MAX_ATTENTION_TIME},false))
      )
    )
    select id, question, username as "creatorUsername", slug,
      case when provider in ('odds','bdl','football-data') then provider else 'unknown' end as provider,
      coalesce(nullif(league,''),league_key) as league, coalesce(reason,'Overdue final') as reason,
      case when reason is null then 'overdue' else 'stored' end as source,
      since::double precision as since, close_ms::double precision as "closeTime",
      correction_ms::double precision as "correctionTime"
    from incidents
    where (reason is not null or since < $2)
      -- A dated incident first seen after this page sequence belongs on the next refresh.
      and ($4::text is null or reason is null or marked is null or marked <= $2 or marked > $8)
      and ($4::text is null or (coalesce(since,${
        MAX_ATTENTION_TIME + 1
      }),id collate "C")
        > ($5::bigint,$4::text collate "C"))
    order by coalesce(since,${MAX_ATTENTION_TIME + 1}), id collate "C"
    limit $6`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      asOf,
      new Date(asOf - BDL_OVERDUE_ALERT_MS),
      after?.id ?? null,
      after?.since ?? MAX_ATTENTION_TIME + 1,
      limit + 1,
      BDL_LEAGUE_KEYS,
      now,
    ]
  )

  const items = rows
    .slice(0, limit)
    .map(({ creatorUsername, slug, correctionTime, ...item }) => ({
      ...item,
      reason:
        correctionTime &&
        item.reason !== 'F1 classification changed after settlement'
          ? `${
              item.reason
            } · F1 classification changed after settlement (${new Date(
              correctionTime
            ).toISOString()})`
          : item.reason,
      question: item.question || item.id,
      href:
        creatorUsername &&
        slug &&
        creatorUsername.length <= 128 &&
        slug.length <= 256 &&
        !/[^a-zA-Z0-9_-]/.test(creatorUsername) &&
        !/[^a-zA-Z0-9_-]/.test(slug)
          ? contractPath({ creatorUsername, slug })
          : null,
    }))
  const last = items[items.length - 1]
  return {
    items,
    nextCursor:
      rows.length > limit ? `1:${asOf}:${last.since ?? 'u'}:${last.id}` : null,
  }
}
