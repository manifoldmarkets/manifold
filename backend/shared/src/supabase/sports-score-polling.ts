import { BDL_LEAGUE_KEYS } from 'common/bdl/leagues'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { parseBdlEventId } from 'common/sports-ids'
import { SPORTS_KICKOFF_TIMESTAMP_PATTERN } from 'common/sports-kickoff-interface'
import { sportsProviderSql } from './sports-provider'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  parsePollingRows,
  sportForLeague,
  ScorePollingSettings,
} from 'common/sports-score-polling'

// How often the resolver asks for scores (common/sports-score-polling.ts),
// set on /admin/sports. A missing row means the default.

export interface ScorePollingRow {
  target: string
  intervalSeconds: number
  updatedBy: string
  updatedTime: number
}

export function getScorePollingRows(
  pg: SupabaseDirectClient,
  targets?: string[]
): Promise<ScorePollingRow[]> {
  return pg.map(
    `select target, interval_seconds, updated_by, updated_time
       from sports_score_polling${targets ? ' where target = any($1)' : ''}`,
    targets ? [targets] : [],
    (r) => ({
      target: r.target,
      intervalSeconds: r.interval_seconds,
      updatedBy: r.updated_by,
      updatedTime: new Date(r.updated_time).getTime(),
    })
  )
}

export async function getScorePollingSettings(
  pg: SupabaseDirectClient,
  targets?: string[]
): Promise<ScorePollingSettings> {
  return parsePollingRows(await getScorePollingRows(pg, targets))
}

/** Sets a target's interval, or with null goes back to the default. */
export async function setScorePolling(
  pg: SupabaseDirectClient,
  props: { target: string; intervalSeconds: number | null; userId: string }
) {
  const { target, intervalSeconds, userId } = props
  if (intervalSeconds === null) {
    await pg.none(`delete from sports_score_polling where target = $1`, [
      target,
    ])
    return
  }
  await pg.none(
    `insert into sports_score_polling (target, interval_seconds, updated_by)
     values ($1, $2, $3)
     on conflict (target) do update
       set interval_seconds = excluded.interval_seconds,
           updated_by = excluded.updated_by,
           updated_time = now()`,
    [target, intervalSeconds, userId]
  )
}

/** Pollable official games in the same time window as the legacy Odds panel.
 * A busy provider cannot displace the other's game overrides. */
export function getScorePollingGames(
  pg: Pick<SupabaseDirectClient, 'manyOrNone'>
) {
  type Row = {
    contractId: string
    question: string
    slug: string
    label: string | null
    provider: 'odds' | 'bdl'
    event: string
    startTime: string | number
  }
  return pg
    .manyOrNone<Row>(
      `with candidates as (
       select c.id as "contractId", c.data->>'question' as question,
              c.data->>'slug' as slug, c.data->>'sportsLeague' as label,
              c.data->>'sportsLeagueKey' as stamped, c.data->>'sportsMarketType' as kind,
              c.data->>'sportsEventId' as event, ${sportsProviderSql()} as provider,
              (jsonb_path_query_first_tz(to_jsonb(regexp_replace(c.data->>'sportsStartTimestamp', 'Z$', '+00:00')),
                '$.datetime()', '{}'::jsonb, true) #>> '{}')::timestamptz as kickoff
         from contracts c
        where c.creator_id = any($1) and c.resolution is null
          and c.token = 'MANA' and c.visibility = 'public' and not coalesce(c.deleted, false)
          and c.data->>'sportsEventId' is not null
          and coalesce(c.data->'sportsFixture', 'false'::jsonb) = 'false'::jsonb
          and not starts_with(c.data->>'sportsEventId', 'fixture:')
          and c.close_time > now() - interval '6 hours'
          and c.close_time < now() + interval '16 hours'
          and c.data->>'sportsStartKnown' is distinct from 'false'
          and c.data->>'sportsStartTimestamp' ~ $2
     ), ordered as (
       select *, row_number() over (partition by provider order by kickoff, "contractId") as position
         from candidates
        where kickoff < now() + interval '12 hours'
          and (provider = 'odds' or (
            provider = 'bdl' and kind = 'moneyline'
            and split_part(event, ':', 1) = 'bdl'
            and split_part(event, ':', 2) = any($3)
            and (stamped is null or stamped = split_part(event, ':', 2))
            and split_part(event, ':', 3) ~ '^[1-9][0-9]*$'))
     )
     select "contractId", question, slug, label, provider, event, extract(epoch from kickoff) * 1000 as "startTime"
       from ordered where position <= 100 order by kickoff, "contractId"`,
      [
        MANIFOLD_SPORTS_USER_IDS,
        SPORTS_KICKOFF_TIMESTAMP_PATTERN,
        BDL_LEAGUE_KEYS.filter((k) => k !== 'f1'),
      ]
    )
    .then((rows) =>
      rows.flatMap((row) => {
        const parsed =
          row.provider === 'bdl' ? parseBdlEventId(row.event) : null
        if (row.provider === 'bdl' && !parsed) return []
        return [
          {
            contractId: row.contractId,
            question: row.question,
            slug: row.slug,
            sport: sportForLeague(row.label ?? undefined),
            startTime: Number(row.startTime),
            ...(parsed && { leagueKey: parsed.league }),
          },
        ]
      })
    )
}

/** Original Odds-only admin list while the BDL rollout is off. */
export function getLegacyScorePollingGames(pg: SupabaseDirectClient) {
  return pg.map(
    `select id, data->>'question' as question, data->>'slug' as slug,
              data->>'sportsLeague' as league,
              data->>'sportsStartTimestamp' as start
         from contracts
        where creator_id = any($1)
          and resolution is null
          and data->>'sportsEventId' like 'odds:%'
          and close_time > now() - interval '6 hours'
          and close_time < now() + interval '16 hours'
          and (data->>'sportsStartTimestamp')::timestamptz
                < now() + interval '12 hours'
        order by start
        limit 100`,
    [MANIFOLD_SPORTS_USER_IDS],
    (r) => ({
      contractId: r.id as string,
      question: r.question as string,
      slug: r.slug as string,
      sport: sportForLeague(r.league ?? undefined),
      startTime: Date.parse(r.start),
    })
  )
}
