import { z } from 'zod'
import { isBdlLeagueKey } from './bdl/leagues'
import { SPORT_KEY_RE } from './sports-schedule'

// Keep all six PostgreSQL fractional digits across page boundaries.
const cursor = z
  .string()
  .max(157)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[A-Za-z0-9_-]{1,128}$/)
  .refine((value) => {
    const stamp = value.split('|')[0]
    const time = Date.parse(stamp)
    return (
      !stamp.startsWith('0000-') &&
      Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 23) === stamp.slice(0, 23)
    )
  })
export const sportsResultsProps = z
  .object({
    sport: z
      .string()
      .max(100)
      .regex(SPORT_KEY_RE)
      .refine((sport) => sport !== 'all'),
    league: z.string().max(64).refine(isBdlLeagueKey).optional(),
    cursor: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict()
export type SportsResultsProps = z.infer<typeof sportsResultsProps>
export type SportsResult = {
  id: string
  href: string
  question: string
  league: string | null
  settledAt: number
  payout: string
  finalScore: {
    home: string
    homeScore: number
    away: string
    awayScore: number
    qualifier?: 'extra-time' | 'penalties'
    penalties?: { home: number; away: number }
  } | null
  groupSlugs: string[]
}
export type SportsResultsPage = {
  items: SportsResult[]
  nextCursor: string | null
}
