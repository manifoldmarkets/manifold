import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  TOURNAMENT_CONFIGS,
  fetchAllCompetitionMatches,
  stageLabel,
  teamFlagFromArea,
  computeCloseTime,
  stageLiquidityForMatch,
  matchSportsEventId,
  ACTIVE_SPORTS_MARKET_FILTER,
} from 'shared/sports-markets'

export const adminSportsFixtures: APIHandler<'admin-sports-fixtures'> = async (
  props,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)

  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? ''
  if (!apiKey)
    throw new APIError(500, 'FOOTBALL_DATA_API_KEY not set on server')

  const { competitionCode, dateFrom, dateTo, stage } = props

  const config = TOURNAMENT_CONFIGS[competitionCode]
  if (!config)
    throw new APIError(400, `Unknown competition code: ${competitionCode}`)

  const pg = createSupabaseDirectClient()

  const matches = await fetchAllCompetitionMatches(config, apiKey, {
    dateFrom,
    dateTo,
  })

  const filtered = (stage ? matches.filter((m) => m.stage === stage) : matches)
    .filter((m) => m.homeTeam.name && m.awayTeam.name)
    .filter((m) => ['SCHEDULED', 'TIMED'].includes(m.status))

  // Batch-check which matches already have an *active* market. A market that's
  // been resolved N/A no longer counts as "exists" here, so the row becomes
  // selectable and a corrected market can be regenerated.
  const eventIds = filtered.map((m) => matchSportsEventId(m))
  const existingRows = await pg.manyOrNone<{
    event_id: string
    market_id: string
  }>(
    `select data->>'sportsEventId' as event_id, id as market_id
     from contracts
     where data->>'sportsEventId' = any($1::text[])
       and ${ACTIVE_SPORTS_MARKET_FILTER}`,
    [eventIds]
  )
  const marketByEventId = new Map(
    existingRows.map((r) => [r.event_id, r.market_id])
  )

  const fixtures = filtered.map((m) => {
    const eventId = matchSportsEventId(m)
    return {
      id: m.id,
      homeTeam: {
        name: m.homeTeam.name,
        tla: m.homeTeam.tla,
        crest: m.homeTeam.crest,
      },
      awayTeam: {
        name: m.awayTeam.name,
        tla: m.awayTeam.tla,
        crest: m.awayTeam.crest,
      },
      homeFlag: teamFlagFromArea(m.homeTeam.area?.code ?? ''),
      awayFlag: teamFlagFromArea(m.awayTeam.area?.code ?? ''),
      utcDate: m.utcDate,
      stageCode: m.stage,
      stageLabel: stageLabel(m),
      group: m.group,
      status: m.status,
      closeTime: computeCloseTime(m, config),
      liquidityTier: stageLiquidityForMatch(m, config),
      existingMarketId: marketByEventId.get(eventId) ?? null,
      sportsEventId: eventId,
    }
  })

  return { fixtures }
}
