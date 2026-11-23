import { APIHandler } from './helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { chunk, groupBy, keyBy, orderBy, sortBy, sumBy } from 'lodash'
import { SEARCH_TOPICS_TO_SUBTOPICS } from 'common/topics'
import { DAY_MS } from 'common/util/time'

// Map group IDs to topic names for easier lookup (cached at module level)
const topicGroupMapping: Record<string, string> = {}
for (const [topic, subtopics] of Object.entries(SEARCH_TOPICS_TO_SUBTOPICS)) {
  for (const subtopic of subtopics) {
    for (const groupId of subtopic.groupIds) {
      topicGroupMapping[groupId] = topic
    }
  }
}

// The calibration chart uses the user's most recent buys on binary markets
// that resolved YES or NO. Each bet is an independent prediction, weighted by
// shares.
export const CALIBRATION_SAMPLE_SIZE = 5000
const CALIBRATION_MARKETS_PER_QUERY = 200

export type CalibrationMarket = {
  contract_id: string
  // The user's latest bet of any kind on this market, in microseconds.
  last_us: number
}

export type CalibrationBet = {
  // Microseconds, so the newest-first order is exact. Milliseconds would
  // merge distinct bets.
  created_us: number
  prob_bucket: number
  outcome: string
  shares: number
  resolution: string
}

// The newest `size` qualifying bets across the given markets. Markets are read
// newest last bet first. Once the sample is full, a market whose latest bet
// is older than the sample's oldest bet can't change the sample, and neither
// can any market after it. So heavy traders read about as many bets as the
// sample needs, not their whole history.
export async function selectCalibrationSample(
  markets: CalibrationMarket[],
  fetchBets: (markets: CalibrationMarket[]) => Promise<CalibrationBet[]>,
  size = CALIBRATION_SAMPLE_SIZE,
  marketsPerQuery = CALIBRATION_MARKETS_PER_QUERY
): Promise<CalibrationBet[]> {
  if (size <= 0) return []
  let sample: CalibrationBet[] = []
  const newestFirst = orderBy(markets, (m) => m.last_us, 'desc')
  for (const batch of chunk(newestFirst, marketsPerQuery)) {
    const cutoff =
      sample.length >= size ? sample[size - 1].created_us : -Infinity
    const open = batch.filter((m) => m.last_us >= cutoff)
    if (open.length === 0) break
    const bets = await fetchBets(open)
    sample = orderBy([...sample, ...bets], (b) => b.created_us, 'desc').slice(
      0,
      size
    )
  }
  return sample
}

async function getCalibrationSample(
  pg: SupabaseDirectClient,
  userId: string,
  contractIds: string[]
): Promise<CalibrationBet[]> {
  if (contractIds.length === 0) return []

  // Latest bet per market. contract_bets_contract_user_id is
  // (contract_id, user_id, created_time desc), so this reads the index only.
  const lastBets = await pg.manyOrNone<{
    contract_id: string
    last_us: number | null
  }>(
    `
    select
      x.contract_id,
      (
        select (extract(epoch from max(cb.created_time)) * 1000000)::bigint
        from contract_bets cb
        where cb.contract_id = x.contract_id
          and cb.user_id = $1
      ) as last_us
    from unnest($2::text[]) as x(contract_id)
    `,
    [userId, contractIds]
  )
  const withBets = lastBets.flatMap((m) =>
    m.last_us === null ? [] : [{ ...m, last_us: m.last_us }]
  )

  return selectCalibrationSample(withBets, (batch) =>
    // One index walk per market, newest first. Never filter by user_id alone
    // here: the user index walks every bet the user has made, which is what
    // timed out for heavy traders. The resolution is read again here, with
    // the bets, so a market reopened since the first lookup drops out.
    pg.manyOrNone<CalibrationBet>(
      `
      select
        (extract(epoch from b.created_time) * 1000000)::bigint as created_us,
        case
          when b.prob_after < 0.02 then 0.01
          when b.prob_after < 0.04 then 0.03
          when b.prob_after < 0.075 then 0.05
          when b.prob_after < 0.15 then 0.10
          when b.prob_after < 0.25 then 0.20
          when b.prob_after < 0.35 then 0.30
          when b.prob_after < 0.45 then 0.40
          when b.prob_after < 0.55 then 0.50
          when b.prob_after < 0.65 then 0.60
          when b.prob_after < 0.75 then 0.70
          when b.prob_after < 0.85 then 0.80
          when b.prob_after < 0.925 then 0.90
          when b.prob_after < 0.96 then 0.95
          when b.prob_after < 0.98 then 0.97
          else 0.99
        end as prob_bucket,
        b.outcome,
        b.shares,
        c.resolution
      from unnest($2::text[]) as x(contract_id)
      join contracts c on c.id = x.contract_id
        and c.outcome_type = 'BINARY'
        and c.resolution in ('YES', 'NO')
      cross join lateral (
        select cb.created_time, cb.prob_after, cb.outcome, cb.shares
        from contract_bets cb
        where cb.contract_id = x.contract_id
          and cb.user_id = $1
          and cb.amount > 0
          and (cb.is_redemption is not true or cb.is_redemption is null)
        order by cb.created_time desc
        limit $3
      ) b
      order by b.created_time desc
      limit $3
      `,
      [userId, batch.map((m) => m.contract_id), CALIBRATION_SAMPLE_SIZE]
    )
  )
}

export function buildCalibrationPoints(sample: CalibrationBet[]) {
  const yesPoints: { x: number; y: number }[] = []
  const noPoints: { x: number; y: number }[] = []

  const groups = groupBy(sample, (b) => `${b.prob_bucket}|${b.outcome}`)
  for (const bets of Object.values(groups)) {
    const { prob_bucket, outcome } = bets[0]
    const totalShares = sumBy(bets, (b) => b.shares)
    const yesShares = sumBy(bets, (b) =>
      b.resolution === 'YES' ? b.shares : 0
    )
    const yesRate = totalShares > 0 ? yesShares / totalShares : 0
    if (!Number.isFinite(yesRate)) continue

    if (outcome === 'YES') {
      // For YES bets: what % resolved YES?
      yesPoints.push({ x: prob_bucket, y: yesRate })
    } else {
      // For NO bets: what % resolved YES? (should be on the diagonal if calibrated)
      noPoints.push({ x: prob_bucket, y: yesRate })
    }
  }

  return {
    yesPoints: sortBy(yesPoints, (p) => p.x),
    noPoints: sortBy(noPoints, (p) => p.x),
    totalBets: sample.length,
  }
}

const finiteOrZero = (n: number) => (Number.isFinite(n) ? n : 0)

export const getUserCalibration: APIHandler<'get-user-calibration'> = async (
  props
) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()

  // Check if user exists
  const user = await pg.oneOrNone(`SELECT id FROM users WHERE id = $1`, [
    userId,
  ])
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  // No query below reads the user's whole bet history. Heavy traders have
  // hundreds of thousands of bets, mostly redemptions, and reading them all
  // ran past the 60 s statement timeout. Bets are read one market at a time
  // through the (contract_id, user_id) index, so each walk covers only this
  // user's rows on that market; LIMIT caps the qualifying rows returned, not
  // the rows a market's walk may have to skip.
  const [metrics, portfolioHistory] = await Promise.all([
    // One summary row per market. Volume per market is the money in plus the
    // money out, the same definition as the profile's volume achievement
    // (mv_ach_volume, get-user-achievements). Perp rows carry their own
    // totals (shared/perps/user-contract-metrics).
    // The coalesce condition matches unique_user_contract_answer's third key,
    // so answer rows are skipped in the index instead of being read from the
    // table: a heavy multiple-choice trader has about three answer rows per
    // summary row. answer_id IS NULL keeps the meaning exact.
    pg.manyOrNone<{
      contract_id: string
      profit: number
      volume: number
    }>(
      `
      SELECT
        contract_id,
        COALESCE(profit, 0) as profit,
        COALESCE((data->>'totalAmountInvested')::numeric, 0)
          + COALESCE((data->>'totalAmountSold')::numeric, 0) as volume
      FROM user_contract_metrics
      WHERE user_id = $1
        AND COALESCE(answer_id, '') = ''
        AND answer_id IS NULL
      `,
      [userId]
    ),

    // Portfolio history (one point per day, last 365 daily snapshots)
    pg.manyOrNone<{
      timestamp: number
      balance: number
      investment_value: number
      total_deposits: number
      spice_balance: number
    }>(
      `
      WITH daily AS (
        SELECT DISTINCT ON (DATE(ts))
          EXTRACT(EPOCH FROM ts)::bigint * 1000 as timestamp,
          COALESCE(balance, 0) as balance,
          COALESCE(investment_value, 0) as investment_value,
          COALESCE(total_deposits, 0) as total_deposits,
          COALESCE(spice_balance, 0) as spice_balance
        FROM user_portfolio_history
        WHERE user_id = $1
        ORDER BY DATE(ts), ts DESC
      ),
      recent AS (
        SELECT * FROM daily ORDER BY timestamp DESC LIMIT 365
      )
      SELECT * FROM recent ORDER BY timestamp ASC
      `,
      [userId]
    ),
  ])

  const contractIds = metrics.map((m) => m.contract_id)
  const totalMarkets = metrics.length

  const [contracts, contractGroups] = await Promise.all([
    contractIds.length > 0
      ? pg.manyOrNone<{
          id: string
          resolution: string | null
          outcome_type: string
          token: string
        }>(
          `SELECT id, resolution, outcome_type, token FROM contracts WHERE id = ANY($1)`,
          [contractIds]
        )
      : Promise.resolve([]),

    // Get contract groups for topic breakdown
    contractIds.length > 0
      ? pg.manyOrNone<{ contract_id: string; group_id: string }>(
          `SELECT contract_id, group_id FROM group_contracts WHERE contract_id = ANY($1)`,
          [contractIds]
        )
      : Promise.resolve([]),
  ])
  const contractsById = keyBy(contracts, (c) => c.id)

  const sample = await getCalibrationSample(
    pg,
    userId,
    contracts
      .filter(
        (c) =>
          c.outcome_type === 'BINARY' &&
          (c.resolution === 'YES' || c.resolution === 'NO')
      )
      .map((c) => c.id)
  )
  const { yesPoints, noPoints, totalBets } = buildCalibrationPoints(sample)

  // Mana markets only, like the profile's volume achievement. Other tokens
  // would mix units into a mana figure.
  const manaVolume = (m: { contract_id: string; volume: number }) =>
    contractsById[m.contract_id]?.token === 'MANA' ? finiteOrZero(m.volume) : 0
  const totalVolume = sumBy(metrics, manaVolume)

  // Calculate win rate - only count resolved markets for both numerator and denominator
  const resolvedMetrics = metrics.filter(
    (m) => contractsById[m.contract_id]?.resolution != null
  )
  const resolvedMarkets = resolvedMetrics.length
  const profitableMarkets = resolvedMetrics.filter((m) => m.profit > 0).length
  const winRate =
    resolvedMarkets > 0 ? (profitableMarkets / resolvedMarkets) * 100 : 0

  // Build topic stats
  const contractToTopics: Record<string, Set<string>> = {}
  for (const { contract_id, group_id } of contractGroups) {
    const topic = topicGroupMapping[group_id]
    if (topic) {
      if (!contractToTopics[contract_id]) {
        contractToTopics[contract_id] = new Set()
      }
      contractToTopics[contract_id].add(topic)
    }
  }

  const topicStats: Record<
    string,
    { profit: number; volume: number; marketCount: number }
  > = {}
  for (const metric of metrics) {
    const topics = contractToTopics[metric.contract_id]
    if (topics) {
      for (const topic of Array.from(topics)) {
        if (!topicStats[topic]) {
          topicStats[topic] = { profit: 0, volume: 0, marketCount: 0 }
        }
        topicStats[topic].profit += metric.profit
        topicStats[topic].volume += manaVolume(metric)
        topicStats[topic].marketCount += 1
      }
    }
  }

  const profitByTopic = sortBy(
    Object.entries(topicStats).map(([topic, stats]) => ({
      topic,
      profit: stats.profit,
      volume: stats.volume,
      marketCount: stats.marketCount,
    })),
    (t) => -Math.abs(t.profit)
  )

  // Format portfolio history and calculate returns
  const portfolioHistoryFormatted = portfolioHistory.map((h) => ({
    timestamp: h.timestamp,
    value: h.balance + h.investment_value + h.spice_balance,
    profit: h.balance + h.investment_value + h.spice_balance - h.total_deposits,
  }))

  // Calculate total profit from portfolio history (current profit, consistent with profile page)
  const firstPoint = portfolioHistoryFormatted[0]
  const lastPoint =
    portfolioHistoryFormatted[portfolioHistoryFormatted.length - 1]
  const totalProfit = lastPoint?.profit ?? 0
  // Profit over the 365-day window
  const profit365 = (lastPoint?.profit ?? 0) - (firstPoint?.profit ?? 0)

  // Calculate volatility, Sharpe ratio, and max drawdown from portfolio history
  let volatility = 0
  let sharpeRatio = 0
  let maxDrawdown = 0

  if (portfolioHistoryFormatted.length >= 2) {
    // Calculate daily profit changes normalized by portfolio value
    // Data is already sampled to one point per day, so each interval is ~1 day
    const dailyReturns: number[] = []
    for (let i = 1; i < portfolioHistoryFormatted.length; i++) {
      const prev = portfolioHistoryFormatted[i - 1]
      const curr = portfolioHistoryFormatted[i]
      const profitChange = curr.profit - prev.profit
      const avgValue = (curr.value + prev.value) / 2
      const daysBetween = (curr.timestamp - prev.timestamp) / DAY_MS

      // Only include if we have valid data and reasonable time gap (skip gaps > 7 days)
      if (avgValue > 0 && daysBetween > 0 && daysBetween < 7) {
        // Normalize to daily return rate
        const dailyReturn = profitChange / avgValue / daysBetween
        dailyReturns.push(dailyReturn)
      }
    }

    if (dailyReturns.length > 0) {
      // Calculate mean daily return
      const meanDailyReturn =
        dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length

      // Calculate standard deviation of daily returns (volatility)
      const squaredDiffs = dailyReturns.map((r) =>
        Math.pow(r - meanDailyReturn, 2)
      )
      const variance =
        squaredDiffs.reduce((a, b) => a + b, 0) / dailyReturns.length
      const dailyVolatility = Math.sqrt(variance)

      // Annualize: daily volatility * sqrt(365), convert to percentage
      volatility = dailyVolatility * Math.sqrt(365) * 100

      // Sharpe ratio: (annualized return - risk-free rate) / annualized volatility
      const RISK_FREE_RATE = 5 // 5% annual risk-free rate
      const annualizedReturn = meanDailyReturn * 365 * 100
      sharpeRatio =
        volatility > 0 ? (annualizedReturn - RISK_FREE_RATE) / volatility : 0
    }

    // Calculate maximum drawdown based on PROFIT (not portfolio value)
    // This matches the profit graph shown to users
    let peakProfit = portfolioHistoryFormatted[0].profit
    let valueAtPeakProfit = portfolioHistoryFormatted[0].value
    for (const point of portfolioHistoryFormatted) {
      if (point.profit > peakProfit) {
        peakProfit = point.profit
        valueAtPeakProfit = point.value
      }
      // Express drawdown as percentage of portfolio value at profit peak
      if (valueAtPeakProfit > 0) {
        const drawdown = ((peakProfit - point.profit) / valueAtPeakProfit) * 100
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown
        }
      }
    }
  }

  return {
    calibration: {
      yesPoints,
      noPoints,
      totalBets,
    },
    performanceStats: {
      totalProfit,
      profit365,
      totalVolume,
      winRate,
      totalMarkets,
      resolvedMarkets,
      volatility: Math.round(volatility * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    },
    portfolioHistory: portfolioHistoryFormatted,
    profitByTopic,
  }
}
