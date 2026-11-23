import { isMajorLeague } from 'common/bdl/major-leagues'
import { MULTI_CPMM_MECHANISMS_SQL } from 'common/contract'
import { SPORTS_CALENDAR, SportId } from 'common/sports-calendar'
import { SPORTS_GAME_EVENT_PATTERNS } from 'common/sports-discovery'

const majorFeeds = SPORTS_CALENDAR.flatMap(({ sport, oddsKey }) =>
  oddsKey && isMajorLeague(sport) ? [{ sport, oddsKey }] : []
)

export function majorOddsKeys(sport: SportId) {
  return [
    ...new Set(
      majorFeeds.filter((f) => f.sport === sport).map((f) => f.oddsKey)
    ),
  ]
}

const oddsEvent = new RegExp(SPORTS_GAME_EVENT_PATTERNS.odds)
export function isMajorOddsEvent(id: string) {
  return (
    oddsEvent.exec(id)?.[0] === id &&
    majorFeeds.some((f) => f.oddsKey === id.split(':')[1])
  )
}

// Unstamped house moneylines used the canonical event key and a native multi-answer market.
// League and role, when populated, still have to agree. The caller binds the league label
// and the calendar's Odds keys, and restricts provider, currency and creator.
export function majorOddsMoneylineSql(label: string, keys: string) {
  const role = "c.data->>'sportsMarketType'"
  const league = "c.data->>'sportsLeague'"
  const event = "c.data->>'sportsEventId'"
  return `((${league} = ${label} and ${role} = 'moneyline') or (
    (${league} is null or ${league} = ${label})
    and (${role} = 'moneyline' or (${role} is null and c.mechanism in ${MULTI_CPMM_MECHANISMS_SQL}))
    and ${event} collate "C" ~ '${SPORTS_GAME_EVENT_PATTERNS.odds}'
    and split_part(${event}, ':', 2) = any(${keys}::text[])))`
}
