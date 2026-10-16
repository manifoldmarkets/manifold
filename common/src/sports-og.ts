import { z } from 'zod'
import { FIREBASE_CONFIG } from './envs/constants'
import { getGameDisplayTeams, selectFeaturedGame } from './sports-game-feed'

/** Only fetch team uploads from our own public image bucket in the OG worker. */
export function isSportsOgLogoUrl(value: string) {
  try {
    const url = new URL(value)
    const prefix = `/v0/b/${FIREBASE_CONFIG.storageBucket}/o/`
    return (
      url.origin === 'https://firebasestorage.googleapis.com' &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith(prefix) &&
      decodeURIComponent(url.pathname.slice(prefix.length)).startsWith(
        'user-images/'
      ) &&
      url.searchParams.get('alt') === 'media'
    )
  } catch {
    return false
  }
}

const timestamp = z.number().finite().int().positive().max(8.64e15)
const probability = z.number().finite().min(0).max(1)
const team = z.object({
  name: z.string().trim().min(1).max(120),
  prob: probability,
  shortName: z.string().trim().min(1).max(24).optional().catch(undefined),
  color: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .nullish()
    .catch(null),
  imageUrl: z
    .string()
    .max(1000)
    .refine(isSportsOgLogoUrl)
    .nullish()
    .catch(null),
})
const gameSchema = z.object({
  id: z.string().min(1).max(128),
  question: z.string().trim().min(1).max(500),
  league: z.string().trim().min(1).max(80),
  sport: z.string().max(64).optional(),
  kickoffKnown: z.boolean().optional(),
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
  sport: z.string().max(64).optional(),
  startTime: timestamp.optional(),
  kickoffKnown: z.boolean().optional(),
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
    sport: game.sport,
    startTime: game.startTime,
    kickoffKnown: game.kickoffKnown,
    outcomes,
    asOf: snapshotTime,
  }
}

/** The public image URL is untrusted; bound and validate every displayed field. */
export function parseSportsOgMarket(
  value: string | null
): SportsOgMarket | null {
  if (!value || value.length > 6000) return null
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
