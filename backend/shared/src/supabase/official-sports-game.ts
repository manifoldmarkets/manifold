import {
  SPORTS_GAME_EVENT_PATTERNS,
  SPORTS_GAME_MARKET_TYPES,
} from 'common/sports-discovery'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { pgp } from './init'

/** SQL counterpart of isOfficialSportsGameMarket. A missing field never excludes an ordinary market. */
export function officialSportsGameSql(table: 'contracts' | 'c' = 'contracts') {
  const data = pgp.as.name(table) + '.data'
  const providerTests = Object.entries(SPORTS_GAME_EVENT_PATTERNS).map(
    ([provider, pattern]) =>
      pgp.as.format(
        `((${data}->>'sportsProvider' is null or ${data}->>'sportsProvider' = $1)
        and (${data}->>'sportsEventId') collate "C" ~ $2)`,
        [provider, pattern]
      )
  )
  // The vast majority of search candidates were never created by the sports accounts.
  return pgp.as.format(
    `case when $1:name.creator_id = any($2) then coalesce(
    ${data}->'sportsFixture' is distinct from 'true'::jsonb
    and (${data}->>'sportsMarketType' is null or ${data}->>'sportsMarketType' = any($3))
    and (${providerTests.join(' or ')}), false) else false end`,
    [table, MANIFOLD_SPORTS_USER_IDS, SPORTS_GAME_MARKET_TYPES]
  )
}
