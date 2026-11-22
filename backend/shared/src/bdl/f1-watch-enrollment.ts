import { BDL_CORRECTION_WATCH_MS } from 'common/bdl/constants'

// Only the terminal edit updates these three fields. A podium market may have
// other per-answer edits at the very same resolution millisecond.
export function f1TerminalEditSql(requireScope: boolean) {
  return `exists (select 1 from contract_edits e
    where e.contract_id=c.id and e.editor_id=c.creator_id
      and e.data->>'creatorId'=c.creator_id
      and e.data->>'sportsEventId'=c.data->>'sportsEventId'
      and e.data->>'sportsMarketType'=c.data->>'sportsMarketType'
      and e.updated_keys @> array['isResolved','resolution','resolutionTime']::text[]
      ${
        requireScope
          ? "and e.data->'sportsF1WatchScope'=c.data->'sportsF1WatchScope'"
          : ''
      }
      and (case c.data->>'sportsMarketType'
        when 'winner' then e.idempotency_key='resolution:market:' ||
          (extract(epoch from c.resolution_time)*1000)::bigint::text
        when 'podium' then exists (select 1 from answers a where a.contract_id=c.id
          and a.resolution in ('YES','NO') and a.resolver_id=c.creator_id
          and a.resolution_time=c.resolution_time and e.idempotency_key='resolution:' || a.id || ':' ||
            (extract(epoch from c.resolution_time)*1000)::bigint::text)
      end))`
}

// No classification read is needed. Enrollment or the original 14-day deadline
// removes the diagnostic on the next operator query.
export const missingF1WatchSql = `select c.id,
    (extract(epoch from c.resolution_time)*1000)::bigint as paid_at
  from contracts c join sports_competition_switches s
    on s.enabled and (s.competition_id || ':' || s.phase)=c.data#>>'{sportsF1WatchScope,phase}'
    and extract(epoch from s.updated_time)::text=c.data#>>'{sportsF1WatchScope,activation}'
  where c.resolution_time > to_timestamp(($2::bigint-${BDL_CORRECTION_WATCH_MS})/1000.0)
    and c.resolution_time <= to_timestamp($2::bigint/1000.0)
    and c.resolution is not null and c.resolution<>'CANCEL'
    and c.creator_id=any($1) and c.data->>'resolverId'=c.creator_id
    and c.visibility='public' and c.token='MANA' and c.deleted is not true
    and c.outcome_type='MULTIPLE_CHOICE' and c.data->>'sportsMarketType' in ('winner','podium')
    and c.data->>'sportsFixture' is distinct from 'true' and coalesce(c.data->>'sportsProvider','bdl')='bdl'
    and coalesce(c.data->>'sportsLeagueKey','f1')='f1'
    and c.data->>'sportsEventId' ~ '^bdl-f1:[1-9][0-9]*:[1-9][0-9]*$'
    and c.data#>>'{sportsF1WatchScope,eventId}'=c.data->>'sportsEventId'
    and (c.data#>>'{sportsF1Watch,eventId}'=c.data->>'sportsEventId'
      and c.data#>>'{sportsF1Watch,phase}'=(s.competition_id || ':' || s.phase)
      and c.data#>'{sportsF1Watch,resolutionTime}'=to_jsonb((extract(epoch from c.resolution_time)*1000)::bigint)
      and c.data#>>'{sportsF1Watch,baseline}' ~ '^[a-f0-9]{64}$') is not true
    and ${f1TerminalEditSql(true)}`
