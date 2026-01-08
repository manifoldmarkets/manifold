import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { groupBy, range, sortBy, sumBy, Dictionary } from 'lodash'
import { SEARCH_TOPICS_TO_SUBTOPICS } from 'common/topics'
import { DAY_MS } from 'common/util/time'

const CALIBRATION_POINTS = [1, 3, 5, ...range(10, 100, 10), 95, 97, 99]

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
  const [betsData, metrics, portfolioHistory, volumeResult] = await Promise.all(
    [
      // Query 1: Get user's bets on resolved binary markets (for calibration)
      // Uses random sampling for performance and unbiased results
      pg.manyOrNone<{
        bet_id: string
        contract_id: string
        outcome: string
        amount: number
        shares: number
        prob_after: number
        created_time: number
        resolution: string
      }>(
        `
      SELECT 
        cb.bet_id,
        cb.contract_id,
        cb.outcome,
        cb.amount,
        cb.shares,
        cb.prob_after,
        EXTRACT(EPOCH FROM cb.created_time)::bigint * 1000 as created_time,
        c.resolution
      FROM contract_bets cb
      JOIN contracts c ON cb.contract_id = c.id
      WHERE cb.user_id = $1
        AND c.outcome_type = 'BINARY'
        AND c.resolution IN ('YES', 'NO')
        AND cb.amount > 0
        AND (cb.is_redemption IS NOT TRUE OR cb.is_redemption IS NULL)
      ORDER BY RANDOM()
      LIMIT 2000
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

      // Query 3: Get portfolio history (one point per day, last 1000 daily snapshots)
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
        SELECT * FROM daily ORDER BY timestamp DESC LIMIT 1000
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
    ]
  )

  // Calculate calibration from bets data
  const yesProbBuckets: Dictionary<number> = {}
  const yesCountBuckets: Dictionary<number> = {}
  const noProbBuckets: Dictionary<number> = {}
  const noCountBuckets: Dictionary<number> = {}

  const betsByContract = groupBy(betsData, 'contract_id')

  for (const [_contractId, bets] of Object.entries(betsByContract)) {
    const resolution = bets[0].resolution
    if (resolution !== 'YES' && resolution !== 'NO') continue
    const resolvedYES = resolution === 'YES'

    let currentPosition = 0
    for (const bet of bets) {
      const betSign = bet.outcome === 'YES' ? 1 : -1
      const nextPosition = currentPosition + bet.shares * betSign

      if (
        bet.amount < 0 ||
        (Math.sign(currentPosition) !== betSign &&
          Math.abs(currentPosition) >= Math.abs(bet.shares))
      ) {
        currentPosition = nextPosition
        continue
      }

      let weight = bet.shares
      if (
        Math.sign(currentPosition) !== betSign &&
        Math.abs(currentPosition) < Math.abs(bet.shares)
      ) {
        weight = Math.abs(nextPosition)
      }

      currentPosition = nextPosition

      const rawP = bet.prob_after * 100
      const p = CALIBRATION_POINTS.reduce((prev, curr) =>
        Math.abs(curr - rawP) < Math.abs(prev - rawP) ? curr : prev
      )

      if (bet.outcome === 'YES') {
        yesProbBuckets[p] =
          (yesProbBuckets[p] ?? 0) + (resolvedYES ? weight : 0)
        yesCountBuckets[p] = (yesCountBuckets[p] ?? 0) + weight
      } else {
        noProbBuckets[p] = (noProbBuckets[p] ?? 0) + (resolvedYES ? 0 : weight)
        noCountBuckets[p] = (noCountBuckets[p] ?? 0) + weight
      }
    }
  }

  // Calculate calibration points
  for (const point of CALIBRATION_POINTS) {
    if (yesCountBuckets[point]) {
      yesProbBuckets[point] = yesProbBuckets[point] / yesCountBuckets[point]
    }
    if (noCountBuckets[point]) {
      noProbBuckets[point] = 1 - noProbBuckets[point] / noCountBuckets[point]
    }
  }

  const yesPoints = CALIBRATION_POINTS.filter(
    (p) => yesProbBuckets[p] !== undefined && yesCountBuckets[p]
  ).map((p) => ({ x: p / 100, y: yesProbBuckets[p] }))

  const noPoints = CALIBRATION_POINTS.filter(
    (p) => noProbBuckets[p] !== undefined && noCountBuckets[p]
  ).map((p) => ({ x: p / 100, y: noProbBuckets[p] }))

  // Calculate performance stats
  const contractIds = metrics.map((m) => m.contract_id)
  const totalProfit = sumBy(metrics, 'profit')
  const totalMarkets = metrics.length
  const totalVolume = volumeResult?.total_volume ?? 0
  const roi = totalVolume > 0 ? (totalProfit / totalVolume) * 100 : 0

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

    // Calculate maximum drawdown
    let peak = portfolioHistoryFormatted[0].value
    for (const point of portfolioHistoryFormatted) {
      if (point.value > peak) {
        peak = point.value
      }
      const drawdown = peak > 0 ? ((peak - point.value) / peak) * 100 : 0
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    }
  }

  return {
    calibration: {
      yesPoints,
      noPoints,
      totalBets: betsData.length,
    },
    performanceStats: {
      totalProfit,
      totalVolume,
      roi,
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
