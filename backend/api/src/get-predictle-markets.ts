import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { APIError } from 'common/api/utils'
import { HIDE_FROM_NEW_USER_SLUGS } from 'common/envs/constants'

type PredicleMarket = {
  id: string
  question: string
  slug: string
  creatorUsername: string
  prob: number
}

type PredictleData = {
  markets: PredicleMarket[]
  correctOrder: Record<string, number>
  puzzleNumber: number
}

const MIN_MARKETS_REQUIRED = 5

// Seeded random number generator for deterministic results
function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Get a date string for today in Pacific Time
function getTodayDateString(): string {
  const now = new Date()
  // Format date in Pacific Time (YYYY-MM-DD)
  return now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  })
}

// Convert date string to a seed number
function dateToSeed(dateString: string): number {
  let hash = 0
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

// Get puzzle number by counting existing records
async function getPuzzleNumber(
  pg: ReturnType<typeof createSupabaseDirectClient>
): Promise<number> {
  const result = await pg.one<{ count: string }>(
    `SELECT COUNT(*) as count FROM predictle_daily`
  )
  return parseInt(result.count, 10) + 1 // +1 for the new puzzle we're about to create
}

// Fetch high quality open binary markets
async function fetchEligibleMarkets(
  pg: ReturnType<typeof createSupabaseDirectClient>
): Promise<Contract[]> {
  return pg.map<Contract>(
    `
    SELECT data
    FROM contracts
    WHERE visibility = 'public'
      AND resolution_time IS NULL
      AND (close_time > NOW() OR close_time IS NULL)
      AND outcome_type = 'BINARY'
      AND mechanism = 'cpmm-1'
      AND deleted = false
      AND (data->>'uniqueBettorCount')::int > 25
      AND token = 'MANA'
      AND (data->>'prob')::numeric > 0.05
      AND (data->>'prob')::numeric < 0.95
      AND NOT (group_slugs && $1::text[])
    ORDER BY importance_score DESC
    LIMIT 100
    `,
    [HIDE_FROM_NEW_USER_SLUGS],
    (r) => r.data as Contract
  )
}

// Select and prepare markets for today's puzzle
function prepareMarkets(
  markets: Contract[],
  seed: number
): {
  predictleMarkets: PredicleMarket[]
  correctOrder: Record<string, number>
} {
  // Shuffle with today's seed and pick 5
  const shuffled = shuffleWithSeed(markets, seed)
  const selectedMarkets = shuffled.slice(0, MIN_MARKETS_REQUIRED)

  // Sort by probability for the correct order (high to low)
  const sortedByProb = [...selectedMarkets].sort((a, b) => {
    const probA = 'prob' in a ? a.prob : 0.5
    const probB = 'prob' in b ? b.prob : 0.5
    return probB - probA // Descending order: highest prob = position 1
  })

  // Create a mapping of market id to its correct position (1-indexed)
  const correctOrder: Record<string, number> = {}
  sortedByProb.forEach((m, i) => {
    correctOrder[m.id] = i + 1
  })

  const predictleMarkets: PredicleMarket[] = selectedMarkets.map((c) => ({
    id: c.id,
    question: c.question,
    slug: c.slug,
    creatorUsername: c.creatorUsername,
    prob: 'prob' in c ? c.prob : 0.5,
  }))

  return { predictleMarkets, correctOrder }
}

export const getPredictle: APIHandler<'get-predictle-markets'> = async () => {
  const pg = createSupabaseDirectClient()
  const todayDate = getTodayDateString()

  // Check for cached data first
  const cached = await pg.oneOrNone<{ data: PredictleData }>(
    `SELECT data FROM predictle_daily WHERE date_pt = $1`,
    [todayDate]
  )

  if (cached && cached.data.puzzleNumber) {
    return {
      ...cached.data,
      dateString: todayDate,
    }
  }

  // No cache - compute today's markets
  const seed = dateToSeed(todayDate)
  const markets = await fetchEligibleMarkets(pg)

  if (markets.length < MIN_MARKETS_REQUIRED) {
    throw new APIError(
      500,
      `Not enough markets available for today's puzzle. Found ${markets.length}, need ${MIN_MARKETS_REQUIRED}.`
    )
  }

  const { predictleMarkets, correctOrder } = prepareMarkets(markets, seed)
  const puzzleNumber = await getPuzzleNumber(pg)

  const data: PredictleData = {
    markets: predictleMarkets,
    correctOrder,
    puzzleNumber,
  }

  // Try to insert - if conflict, fetch the existing data
  const inserted = await pg.oneOrNone<{ data: PredictleData }>(
    `INSERT INTO predictle_daily (date_pt, data) VALUES ($1, $2)
     ON CONFLICT (date_pt) DO NOTHING
     RETURNING data`,
    [todayDate, JSON.stringify(data)]
  )

  // If insert failed (conflict), fetch the existing record
  if (!inserted) {
    const existing = await pg.one<{ data: PredictleData }>(
      `SELECT data FROM predictle_daily WHERE date_pt = $1`,
      [todayDate]
    )
    return {
      ...existing.data,
      dateString: todayDate,
    }
  }

  return {
    ...inserted.data,
    dateString: todayDate,
  }
}
