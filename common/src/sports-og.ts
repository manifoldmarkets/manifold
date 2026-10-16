import { z } from 'zod'
import { getGameDisplayTeams, selectFeaturedGame } from './sports-game-feed'

const timestamp = z.number().finite().int().positive().max(8.64e15)
const probability = z.number().finite().min(0).max(1)
const team = z.object({
  name: z.string().trim().min(1).max(120),
  prob: probability,
})
const gameSchema = z.object({
  id: z.string().min(1).max(128),
  question: z.string().trim().min(1).max(500),
  league: z.string().trim().min(1).max(80),
  status: z.enum(['live', 'upcoming', 'finished']),
  startTime: timestamp,
  closeTime: timestamp,
  isResolved: z.boolean(),
  volume: z.number().finite().catch(0),
  home: team,
  away: team,
  draw: z.object({ prob: probability }).nullable(),
})

const marketSchema = z.object({
  id: z.string().min(1).max(128),
  question: z.string().trim().min(1).max(500),
  league: z.string().trim().min(1).max(80),
  outcomes: z.array(team).min(2).max(3),
  asOf: timestamp,
})

export type SportsOgMarket = z.infer<typeof marketSchema>

/** Use the same initial featured-game ranking and team order as /sports. */
export function selectSportsOgMarket(
  response: unknown,
  now = Date.now()
): SportsOgMarket | null {
  const snapshot = z
    .object({ snapshotTime: timestamp, games: z.array(z.unknown()).max(500) })
    .safeParse(response)
  if (!snapshot.success || !Number.isFinite(now)) return null
  const { snapshotTime, games } = snapshot.data
  // Do not turn an old API response into an apparently fresh odds snapshot.
  if (now - snapshotTime > 10 * 60_000 || snapshotTime > now + 60_000)
    return null
  const candidates = games.flatMap((value) => {
    const parsed = gameSchema.safeParse(value)
    return parsed.success &&
      !parsed.data.isResolved &&
      parsed.data.closeTime > now
      ? [parsed.data]
      : []
  })
  const game = selectFeaturedGame(candidates)
  if (!game) return null
  const outcomes = getGameDisplayTeams(game).map(({ team }) => team)
  if (game.draw) outcomes.push({ name: 'Draw', prob: game.draw.prob })
  return {
    id: game.id,
    question: game.question,
    league: game.league,
    outcomes,
    asOf: snapshotTime,
  }
}

/** The public image URL is untrusted; bound and validate every displayed field. */
export function parseSportsOgMarket(
  value: string | null
): SportsOgMarket | null {
  if (!value || value.length > 2400) return null
  try {
    const parsed = marketSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function formatSportsOgAsOf(asOf: number) {
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(asOf))
      .replace(/\s+/g, ' ') + ' UTC'
  )
}

export function sportsOgImageAlt(market: SportsOgMarket | null) {
  const intro = 'Manifold Sports. Know the game? Make the call. Free to play.'
  if (!market) return intro
  return `${intro} Featured ${market.league} market: ${
    market.question
  }. ${market.outcomes
    .map(({ name, prob }) => `${name} ${Math.round(prob * 100)}%`)
    .join(', ')}. Odds as of ${formatSportsOgAsOf(market.asOf)}.`
}
