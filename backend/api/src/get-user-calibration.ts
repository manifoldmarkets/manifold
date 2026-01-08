import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { groupBy, range, sortBy, sumBy, Dictionary } from 'lodash'
import { SEARCH_TOPICS_TO_SUBTOPICS } from 'common/topics'

const CALIBRATION_POINTS = [1, 3, 5, ...range(10, 100, 10), 95, 97, 99]

// Map group IDs to topic names for easier lookup
function getTopicGroupMapping() {
  const groupToTopic: Record<string, string> = {}
  for (const [topic, subtopics] of Object.entries(SEARCH_TOPICS_TO_SUBTOPICS)) {
    for (const subtopic of subtopics) {
      for (const groupId of subtopic.groupIds) {
        groupToTopic[groupId] = topic
      }
    }
  }
  return groupToTopic
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

  // Get user's bets on resolved binary markets with contract data
  // Using direct columns where available, data jsonb for the rest
  const betsData = await pg.manyOrNone<{
    bet_id: string
    contract_id: string
    outcome: string
    amount: number
    shares: number
    prob_after: number
    created_time: number
    resolution: string
    loan_amount: number
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
      c.resolution,
      COALESCE(cb.loan_amount, 0) as loan_amount
    FROM contract_bets cb
    JOIN contracts c ON cb.contract_id = c.id
    WHERE cb.user_id = $1
      AND c.outcome_type = 'BINARY'
      AND c.resolution IN ('YES', 'NO')
      AND cb.amount > 0
      AND (cb.is_redemption IS NOT TRUE OR cb.is_redemption IS NULL)
    ORDER BY cb.created_time ASC
    LIMIT 10000
    `,
    [userId]
  )

  // Calculate calibration
  const yesProbBuckets: Dictionary<number> = {}
  const yesCountBuckets: Dictionary<number> = {}
  const noProbBuckets: Dictionary<number> = {}
  const noCountBuckets: Dictionary<number> = {}

  // Group bets by contract to track positions
  const betsByContract = groupBy(betsData, 'contract_id')

  for (const [_contractId, bets] of Object.entries(betsByContract)) {
    const resolution = bets[0].resolution
    if (resolution !== 'YES' && resolution !== 'NO') continue
    const resolvedYES = resolution === 'YES'

    let currentPosition = 0
    // Process bets in order
    for (const bet of bets) {
      const betSign = bet.outcome === 'YES' ? 1 : -1
      const nextPosition = currentPosition + bet.shares * betSign

      // Skip if this is effectively a sale
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

  // Calculate calibration score
  let score = 0
  let n = 0
  for (const point of CALIBRATION_POINTS) {
    const prob = point / 100
    const yes = yesProbBuckets[point]
    const no = noProbBuckets[point]

    if (yes !== undefined && yesCountBuckets[point]) {
      score += yes < prob ? (prob - yes) ** 2 : 0
      n++
    }
    if (no !== undefined && noCountBuckets[point]) {
      score += no > prob ? (no - prob) ** 2 : 0
      n++
    }
  }
  const calibrationScore =
    n > 0 ? (-100 * Math.round((score / n) * 1e4)) / 1e4 : 0

  // Get contract metrics for performance stats
  const metrics = await pg.manyOrNone<{
    contract_id: string
    profit: number
    has_yes_shares: boolean
    has_no_shares: boolean
    total_shares_yes: number
    total_shares_no: number
  }>(
    `
    SELECT 
      contract_id,
      COALESCE(profit, 0) as profit,
      has_yes_shares,
      has_no_shares,
      COALESCE(total_shares_yes, 0) as total_shares_yes,
      COALESCE(total_shares_no, 0) as total_shares_no
    FROM user_contract_metrics
    WHERE user_id = $1
      AND answer_id IS NULL
    `,
    [userId]
  )

  // Get resolved status
  const resolvedContractIds = await pg.manyOrNone<{ id: string }>(
    `SELECT id FROM contracts WHERE id = ANY($1) AND resolution IS NOT NULL`,
    [metrics.map((m) => m.contract_id)]
  )
  const resolvedSet = new Set(resolvedContractIds.map((r) => r.id))

  const totalProfit = sumBy(metrics, 'profit')
  const profitableMarkets = metrics.filter((m) => m.profit > 0).length
  const _unprofitableMarkets = metrics.filter((m) => m.profit < 0).length
  const totalMarkets = metrics.length
  const resolvedMarkets = metrics.filter((m) =>
    resolvedSet.has(m.contract_id)
  ).length
  const winRate =
    resolvedMarkets > 0 ? (profitableMarkets / resolvedMarkets) * 100 : 0

  // Get total volume using direct columns
  const volumeResult = await pg.oneOrNone<{ total_volume: number }>(
    `
    SELECT COALESCE(SUM(ABS(amount)), 0) as total_volume
    FROM contract_bets
    WHERE user_id = $1
      AND (is_redemption IS NOT TRUE OR is_redemption IS NULL)
    `,
    [userId]
  )
  const totalVolume = volumeResult?.total_volume ?? 0
  const roi = totalVolume > 0 ? (totalProfit / totalVolume) * 100 : 0

  // Get portfolio history for graphs
  // user_portfolio_history has direct columns, not a data jsonb column
  const portfolioHistory = await pg.manyOrNone<{
    timestamp: number
    balance: number
    investment_value: number
    total_deposits: number
    spice_balance: number
  }>(
    `
    SELECT 
      EXTRACT(EPOCH FROM ts)::bigint * 1000 as timestamp,
      COALESCE(balance, 0) as balance,
      COALESCE(investment_value, 0) as investment_value,
      COALESCE(total_deposits, 0) as total_deposits,
      COALESCE(spice_balance, 0) as spice_balance
    FROM user_portfolio_history
    WHERE user_id = $1
    ORDER BY ts ASC
    `,
    [userId]
  )

  const portfolioHistoryFormatted = portfolioHistory.map((h) => ({
    timestamp: h.timestamp,
    value: h.balance + h.investment_value + h.spice_balance,
    profit: h.balance + h.investment_value + h.spice_balance - h.total_deposits,
  }))

  // Get profit by topic
  const topicGroupMapping = getTopicGroupMapping()
  const contractGroups = await pg.manyOrNone<{
    contract_id: string
    group_id: string
  }>(
    `
    SELECT contract_id, group_id 
    FROM group_contracts 
    WHERE contract_id = ANY($1)
    `,
    [metrics.map((m) => m.contract_id)]
  )

  // Map contracts to topics
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

  // Get amount invested per contract using direct columns
  const contractVolumes = await pg.manyOrNone<{
    contract_id: string
    volume: number
  }>(
    `
    SELECT 
      contract_id,
      SUM(ABS(amount)) as volume
    FROM contract_bets
    WHERE user_id = $1 
      AND contract_id = ANY($2)
      AND (is_redemption IS NOT TRUE OR is_redemption IS NULL)
    GROUP BY contract_id
    `,
    [userId, metrics.map((m) => m.contract_id)]
  )
  const volumeByContract = Object.fromEntries(
    contractVolumes.map((v) => [v.contract_id, v.volume])
  )

  // Aggregate by topic
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

  // Get loan stats from user_portfolio_history_latest (direct columns)
  const loanData = await pg.oneOrNone<{ loan_total: number }>(
    `
    SELECT COALESCE(loan_total, 0) as loan_total
    FROM user_portfolio_history_latest
    WHERE user_id = $1
    `,
    [userId]
  )
  const currentLoan = loanData?.loan_total ?? 0

  // Calculate max loan based on net worth
  const netWorthResult = await pg.oneOrNone<{ net_worth: number }>(
    `
    SELECT 
      COALESCE(u.balance, 0) + COALESCE(p.investment_value, 0) as net_worth
    FROM users u
    LEFT JOIN user_portfolio_history_latest p ON u.id = p.user_id
    WHERE u.id = $1
    `,
    [userId]
  )
  const maxLoan = (netWorthResult?.net_worth ?? 0) * 0.05 // 5% of net worth as max loan
  const utilizationRate = maxLoan > 0 ? (currentLoan / maxLoan) * 100 : 0

  // Get historical loan data (last 30 days) - using direct columns
  const loanHistory = await pg.manyOrNone<{
    date: string
    loan_total: number
  }>(
    `
    SELECT 
      DATE(ts) as date,
      AVG(COALESCE(loan_total, 0)) as loan_total
    FROM user_portfolio_history
    WHERE user_id = $1
      AND ts > NOW() - INTERVAL '30 days'
    GROUP BY DATE(ts)
    ORDER BY date
    `,
    [userId]
  )

  const loanHistoryFormatted = loanHistory.map((h) => ({
    date: h.date,
    amount: h.loan_total,
    utilized: maxLoan > 0 ? (h.loan_total / maxLoan) * 100 : 0,
  }))

  return {
    calibration: {
      yesPoints,
      noPoints,
      score: calibrationScore,
      totalBets: betsData.length,
    },
    performanceStats: {
      totalProfit,
      totalVolume,
      roi,
      winRate,
      totalMarkets,
      resolvedMarkets,
    },
    portfolioHistory: portfolioHistoryFormatted,
    profitByTopic,
    loanStats: {
      currentLoan,
      maxLoan,
      utilizationRate,
      loanHistory: loanHistoryFormatted,
    },
  }
}
