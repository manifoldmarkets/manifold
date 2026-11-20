import { SPORTS_KICKOFF_TIMESTAMP_PATTERN } from 'common/sports-kickoff-interface'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { from, renderSql, select, where } from './sql-builder'
import { sportsProviderSql } from './sports-provider'

// PostgreSQL btrim defaults to a space. Include every ECMAScript trim character
// so stored labels and labels checked at creation agree in every database locale.
const trimCharacters =
  '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680' +
  '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a' +
  '\u2028\u2029\u202f\u205f\u3000\ufeff'

/** Matches isKickoffLiquidityCandidate, using stored answers and contract columns. */
export function kickoffLiquidityCandidatesSql() {
  return renderSql(
    select('c.id'),
    from('contracts c'),
    where(sportsProviderSql() + " in ('odds','bdl','football-data')"),
    where(
      "c.mechanism = 'cpmm-multi-2' and c.outcome_type = 'MULTIPLE_CHOICE'"
    ),
    where("c.token = 'MANA' and c.creator_id = any($1)", [
      MANIFOLD_SPORTS_USER_IDS,
    ]),
    where(
      "not c.deleted and c.resolution is null and c.data->'isResolved' = 'false'::jsonb"
    ),
    where(
      "c.data->'shouldAnswersSumToOne' = 'true'::jsonb and c.data->>'addAnswersMode' = 'DISABLED'"
    ),
    where(
      "c.data->>'sportsMarketType' = 'moneyline' and (c.data->'sportsStartKnown' = 'true'::jsonb or (c.data->>'sportsStartKnown' is null and c.data->>'sportsProvider' is null and starts_with(c.data->>'sportsEventId', 'odds:')))"
    ),
    where(
      "coalesce(c.data->'sportsFixture','false'::jsonb) = 'false'::jsonb and not starts_with(coalesce(c.data->>'sportsEventId',''), 'fixture:')"
    ),
    where("c.data->>'sportsStartTimestamp' ~ $1", [
      SPORTS_KICKOFF_TIMESTAMP_PATTERN,
    ]),
    // datetime() expects an explicit UTC offset. Its silent mode rejects malformed legacy values.
    where(`(jsonb_path_query_first_tz(to_jsonb(regexp_replace(c.data->>'sportsStartTimestamp', 'Z$', '+00:00')),
      '$.datetime()', '{}'::jsonb, true) #>> '{}')::timestamptz < c.close_time`),
    where(
      `(select count(*) between 2 and 3 and bool_and(not a.is_other
      and lower(btrim(coalesce(a.text, ''), $1)) not in ('', 'other') and a.resolution is null)
      from answers a where a.contract_id = c.id)`,
      [trimCharacters]
    )
  )
}
