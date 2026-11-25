import type { Sports } from './contract'
import { parseOddsEventId } from './odds-markets'
import { calendarEntriesOverlapping } from './sports-calendar'
import { parseSportsKickoffMs } from './sports-kickoff-interface'
import { providerOf } from './sports-provider'

/** Old Odds API contracts carry the feed key and kickoff, but no competition ID. */
export function sportsCompetitionIdOf(
  market: Partial<Sports>
): string | undefined {
  const explicit = market.sportsCompetitionId?.trim()
  if (explicit) return explicit
  if (
    providerOf(market) !== 'odds' ||
    market.sportsFixture ||
    market.sportsStartKnown === false
  )
    return undefined
  const event = parseOddsEventId(market.sportsEventId)
  if (!event) return undefined
  const kickoff = parseSportsKickoffMs(market.sportsStartTimestamp)
  const competitions = new Set(
    calendarEntriesOverlapping(kickoff, kickoff)
      .filter((phase) => phase.oddsKey === event.sportKey)
      .map((phase) => phase.competitionId)
  )
  // Two phases of one competition can share a day. Distinct competitions on
  // the same feed (for example bowl games and the CFP) cannot be distinguished.
  return competitions.size === 1 ? [...competitions][0] : undefined
}
