import { type EsportsMarketOverlay } from 'common/api/schema'
import { buildTournamentViews } from 'common/esports/structure'
import { EsportsGame, EsportsSeriesFacts } from 'common/esports/types'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { parseBdlEventId } from 'common/sports-ids'
import { tsToMillis } from 'common/supabase/utils'
import { DAY_MS } from 'common/util/time'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { type APIHandler } from './helpers/endpoint'

// A tournament's series close within weeks of each other, so one window
// around today holds the tournament being played, the last one and the next.
const WINDOW_DAYS = 45
const MAX_SERIES = 600

type AnswerRow = { id: string; text: string | null; prob: number | null }
type SeriesRow = {
  id: string
  slug: string
  close_time: string | null
  resolution: string | null
  event_id: string | null
  creator_username: string | null
  series: unknown
  volume: unknown
  unique_bettor_count: unknown
  answers: AnswerRow[] | null
}

/**
 * A game's tournaments, built only from the series facts the pipeline stored
 * on each official series market, and each series' market to lay over them.
 */
export const getEsportsTournaments: APIHandler<
  'get-esports-tournaments'
> = async ({ game }) => {
  const pg = createSupabaseDirectClient()
  const now = Date.now()
  // Anyone can stamp a sportsEventId through the API; only the @ManifoldSports
  // accounts' markets are series. The first six conditions repeat
  // contracts_sports_schedule_idx's own, so the planner can range-scan it by
  // close time; where that index isn't built yet it reads by creator and
  // close time instead.
  const rows = await pg.manyOrNone<SeriesRow>(
    `select c.id, c.slug, c.close_time, c.resolution,
            c.data->>'sportsEventId' as event_id,
            c.data->>'creatorUsername' as creator_username,
            c.data->'esportsSeries' as series,
            c.data->'volume' as volume,
            c.data->'uniqueBettorCount' as unique_bettor_count,
            (select jsonb_agg(
                      jsonb_build_object('id', a.id, 'text', a.text, 'prob', a.prob)
                      order by a.index)
             from answers a where a.contract_id = c.id) as answers
     from contracts c
     where c.data->>'sportsEventId' is not null
       and c.visibility = 'public'
       and c.token = 'MANA'
       and coalesce(c.deleted, false) = false
       and c.resolution is distinct from 'CANCEL'
       and c.close_time > $1 and c.close_time < $2
       and starts_with(c.data->>'sportsEventId', $3)
       and c.data ? 'esportsSeries'
       and c.creator_id = any($4)
     order by c.close_time desc, c.id desc
     limit $5`,
    [
      new Date(now - WINDOW_DAYS * DAY_MS),
      new Date(now + WINDOW_DAYS * DAY_MS),
      `bdl:${game}:`,
      MANIFOLD_SPORTS_USER_IDS,
      MAX_SERIES,
    ]
  )
  if (rows.length === MAX_SERIES)
    log.warn('get-esports-tournaments hit its row cap', { game, MAX_SERIES })

  // One market per series: the one whose event id is exactly
  // `bdl:<game>:<id>` and whose stored facts name that same match.
  const facts = new Map<number, EsportsSeriesFacts>()
  const markets: Record<string, EsportsMarketOverlay> = {}
  for (const row of rows) {
    const event = parseBdlEventId(row.event_id)
    if (event?.league !== game || event.suffix !== undefined) continue
    const { series } = row
    if (!isSeriesFacts(series, game, event.id) || facts.has(series.id)) continue
    facts.set(series.id, series)
    const overlay = toMarketOverlay(series, row)
    if (overlay) markets[series.id] = overlay
  }
  return { tournaments: buildTournamentViews([...facts.values()]), markets }
}

// The facts are the pipeline's own, but a malformed blob must cost one series,
// not the page.
function isSeriesFacts(
  value: unknown,
  game: EsportsGame,
  id: number
): value is EsportsSeriesFacts {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<EsportsSeriesFacts>
  return (
    s.game === game &&
    s.id === id &&
    Number.isSafeInteger(s.tournament?.id) &&
    typeof s.tournament?.name === 'string' &&
    (s.status === 'scheduled' ||
      s.status === 'in_progress' ||
      s.status === 'final')
  )
}

const normalizeName = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
const sameName = (a: string | null, b: string | null) =>
  !!a && !!b && normalizeName(a) === normalizeName(b)
const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * A series' market as the page shows it. An answer is tied to a team only
 * when the market has exactly two answers with usable prices, the first
 * named as team 1 and the second as team 2. A price is a bet button, so a
 * market that doesn't line up gets a plain link instead of a guess.
 */
export function toMarketOverlay(
  facts: Pick<EsportsSeriesFacts, 'team1' | 'team2'>,
  row: Omit<SeriesRow, 'event_id' | 'series'>
): EsportsMarketOverlay | null {
  if (!row.creator_username) return null
  const { team1, team2 } = facts
  const answers = row.answers ?? []
  const [first, second] = answers
  const teamIds =
    answers.length === 2 &&
    answers.every(
      (a) => typeof a.prob === 'number' && a.prob >= 0 && a.prob <= 1
    ) &&
    team1 &&
    team2 &&
    team1.id !== team2.id &&
    !sameName(team1.name, team2.name) &&
    sameName(first.text, team1.name) &&
    sameName(second.text, team2.name)
      ? [team1.id, team2.id]
      : []
  const closeTime = tsToMillis(row.close_time)
  return {
    contractId: row.id,
    slug: row.slug,
    creatorUsername: row.creator_username,
    answers: answers.map((a, i) => ({
      id: a.id,
      text: a.text ?? '',
      prob: finiteOr(a.prob, 0),
      teamId: teamIds[i] ?? null,
    })),
    volume: finiteOr(row.volume, 0),
    uniqueBettorCount: finiteOr(row.unique_bettor_count, 0),
    closeTime: Number.isFinite(closeTime) ? closeTime : null,
    isResolved: row.resolution != null,
  }
}
