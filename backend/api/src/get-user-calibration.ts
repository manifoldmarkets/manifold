import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { sortBy } from 'lodash'
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

export const getUserCalibration: APIHandler<'get-user-calibration'> = async (
  props
) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()

  // Check if user exists
  const user = await pg.oneOrNone(
    `SELECT id, balance FROM users WHERE id = $1`,
    [userId]
  )
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  // Run all independent queries in parallel for better performance
  const [calibrationData, metrics, portfolioHistory, volumeResult] =
    await Promise.all([
      // Query 1: Calibration data - all aggregation done in SQL for performance
      // Each bet is treated as an independent prediction, weighted by shares
      // Limited to most recent 10k bets, aggregated in SQL (returns ~30 rows)
      pg.manyOrNone<{
        prob_bucket: number
        outcome: string
        total_shares: number
        yes_shares: number
        bet_count: number
      }>(
        `
      WITH bets AS (
        SELECT 
          cb.outcome,
          cb.shares,
          cb.prob_after,
          c.resolution
        FROM contract_bets cb
        JOIN contracts c ON cb.contract_id = c.id
        WHERE cb.user_id = $1
          AND c.outcome_type = 'BINARY'
          AND c.resolution IN ('YES', 'NO')
          AND cb.amount > 0
          AND (cb.is_redemption IS NOT TRUE OR cb.is_redemption IS NULL)
        ORDER BY cb.created_time DESC
        LIMIT 10000
      ),
      bucketed AS (
        SELECT 
          CASE 
            WHEN prob_after < 0.02 THEN 0.01
            WHEN prob_after < 0.04 THEN 0.03
            WHEN prob_after < 0.075 THEN 0.05
            WHEN prob_after < 0.15 THEN 0.10
            WHEN prob_after < 0.25 THEN 0.20
            WHEN prob_after < 0.35 THEN 0.30
            WHEN prob_after < 0.45 THEN 0.40
            WHEN prob_after < 0.55 THEN 0.50
            WHEN prob_after < 0.65 THEN 0.60
            WHEN prob_after < 0.75 THEN 0.70
            WHEN prob_after < 0.85 THEN 0.80
            WHEN prob_after < 0.925 THEN 0.90
            WHEN prob_after < 0.96 THEN 0.95
            WHEN prob_after < 0.98 THEN 0.97
            ELSE 0.99
          END as prob_bucket,
          outcome,
          shares,
          resolution
        FROM bets
      )
      SELECT 
        prob_bucket,
        outcome,
        SUM(shares)::float as total_shares,
        SUM(CASE WHEN resolution = 'YES' THEN shares ELSE 0 END)::float as yes_shares,
        COUNT(*)::int as bet_count
      FROM bucketed
      GROUP BY prob_bucket, outcome
      ORDER BY prob_bucket, outcome
      `,
        [userId]
      ),

      // Query 2: Get contract metrics for performance stats
      pg.manyOrNone<{
        contract_id: string
        profit: number
      }>(
        `
      SELECT 
        contract_id,
        COALESCE(profit, 0) as profit
      FROM user_contract_metrics
      WHERE user_id = $1
        AND answer_id IS NULL
      `,
        [userId]
      ),

      // Query 3: Get portfolio history (one point per day, last 365 daily snapshots)
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

      // Query 4: Get total volume
      pg.oneOrNone<{ total_volume: number }>(
        `
      SELECT COALESCE(SUM(ABS(amount)), 0) as total_volume
      FROM contract_bets
      WHERE user_id = $1
        AND (is_redemption IS NOT TRUE OR is_redemption IS NULL)
      `,
        [userId]
      ),
    ])

  // Build calibration points from pre-aggregated SQL data
  const yesPoints: { x: number; y: number }[] = []
  const noPoints: { x: number; y: number }[] = []
  let totalBets = 0

  for (const row of calibrationData) {
    totalBets += row.bet_count
    const yesRate = row.total_shares > 0 ? row.yes_shares / row.total_shares : 0

    if (row.outcome === 'YES') {
      // For YES bets: what % resolved YES?
      yesPoints.push({ x: row.prob_bucket, y: yesRate })
    } else {
      // For NO bets: what % resolved YES? (should be on the diagonal if calibrated)
      noPoints.push({ x: row.prob_bucket, y: yesRate })
    }
  }

  // Sort by x for consistent display
  yesPoints.sort((a, b) => a.x - b.x)
  noPoints.sort((a, b) => a.x - b.x)

  // Calculate performance stats
  const contractIds = metrics.map((m) => m.contract_id)
  const totalMarkets = metrics.length
  const totalVolume = volumeResult?.total_volume ?? 0

  // Run second batch of queries that depend on first batch results
  const [resolvedContractIds, contractGroups, contractVolumes] =
    await Promise.all([
      // Get resolved status for win rate calculation
      contractIds.length > 0
        ? pg.manyOrNone<{ id: string }>(
            `SELECT id FROM contracts WHERE id = ANY($1) AND resolution IS NOT NULL`,
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

      // Get volume per contract for topic stats
      contractIds.length > 0
        ? pg.manyOrNone<{ contract_id: string; volume: number }>(
            `
            SELECT contract_id, SUM(ABS(amount)) as volume
            FROM contract_bets
            WHERE user_id = $1 
              AND contract_id = ANY($2)
              AND (is_redemption IS NOT TRUE OR is_redemption IS NULL)
            GROUP BY contract_id
            `,
            [userId, contractIds]
          )
        : Promise.resolve([]),
    ])

  // Calculate win rate - only count resolved markets for both numerator and denominator
  const resolvedSet = new Set(resolvedContractIds.map((r) => r.id))
  const resolvedMetrics = metrics.filter((m) => resolvedSet.has(m.contract_id))
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

  const volumeByContract = Object.fromEntries(
    contractVolumes.map((v) => [v.contract_id, v.volume])
  )

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
        topicStats[topic].volume += volumeByContract[metric.contract_id] ?? 0
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
