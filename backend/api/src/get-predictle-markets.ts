import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
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

// Seeded random number generator for deterministic results
function seededRandom(seed: number) {
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
  // Format date in Pacific Time
  const pacificDate = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  })
  return pacificDate // Returns YYYY-MM-DD format
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

// Get puzzle number by counting records in the database
async function getPuzzleNumber(
  pg: ReturnType<typeof createSupabaseDirectClient>
): Promise<number> {
  const result = await pg.one<{ count: string }>(
    `SELECT COUNT(*) as count FROM predictle_daily`
  )
  return parseInt(result.count, 10) + 1 // +1 for the new puzzle we're about to create
}

export const getPredictle: APIHandler<'get-predictle-markets'> = async () => {
  const pg = createSupabaseDirectClient()

  // Get the current date in Pacific Time
  const todayDate = getTodayDateString()

  // Ensure table exists
  await pg.none(`
    CREATE TABLE IF NOT EXISTS predictle_daily (
      date_pt TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_time TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Check for cached data
  const cached = await pg.oneOrNone<{ data: PredictleData }>(
    `SELECT data FROM predictle_daily WHERE date_pt = $1`,
    [todayDate]
  )

  if (cached) {
    // Fallback for old cached data that might not have puzzleNumber
    const puzzleNumber =
      cached.data.puzzleNumber ??
      (await pg
        .one<{ count: string }>(
          `SELECT COUNT(*) as count FROM predictle_daily WHERE date_pt <= $1`,
          [todayDate]
        )
        .then((r) => parseInt(r.count, 10)))

    return {
      ...cached.data,
      puzzleNumber,
      dateString: todayDate,
    }
  }

  // No cache - compute today's markets
  const seed = dateToSeed(todayDate)

  // Fetch high quality open binary markets with > 25 unique bettors
  // Exclude fun/meme/self-resolving topics
  const markets = await pg.map<Contract>(
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

  // Shuffle with today's seed and pick 5
  const shuffled = shuffleWithSeed(markets, seed)
  const selectedMarkets = shuffled.slice(0, 5)

  // Sort by probability for the game (high to low)
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

  const puzzleNumber = await getPuzzleNumber(pg)

  const data: PredictleData = {
    markets: predictleMarkets,
    correctOrder,
    puzzleNumber,
  }

  // Cache the result (ignore conflicts if another request beat us)
  await pg.none(
    `INSERT INTO predictle_daily (date_pt, data) VALUES ($1, $2)
     ON CONFLICT (date_pt) DO NOTHING`,
    [todayDate, JSON.stringify(data)]
  )

  return {
    ...data,
    dateString: todayDate,
  }
}
