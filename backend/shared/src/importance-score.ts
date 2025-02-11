import {
  SupabaseDirectClient,
  SupabaseDirectClientTimeout,
} from 'shared/supabase/init'
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  MONTH_MS,
  WEEK_MS,
  YEAR_MS,
} from 'common/util/time'
import { log } from 'shared/utils'
import {
  BountiedQuestionContract,
  Contract,
  isMarketRanked,
} from 'common/contract'
import { getRecentContractLikes } from 'shared/supabase/likes'
import { clamp, max, sortBy } from 'lodash'
import { floatingEqual, logit } from 'common/util/math'

import { BOT_USERNAMES } from 'common/envs/constants'
import { bulkUpdate } from 'shared/supabase/utils'
import { convertContract } from 'common/supabase/contracts'

export const IMPORTANCE_MINUTE_INTERVAL = 2
export const MIN_IMPORTANCE_SCORE = 0.1

export async function calculateImportanceScore(
  pg: SupabaseDirectClientTimeout,
  readOnly = false,
  rescoreAll = false
) {
  const now = Date.now()
  log('Calculating importance scores')
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const select = (whereClause: string) => `
    select c.data,
           conversion_score,
           importance_score,
           freshness_score,
           view_count,
           daily_score,
           case when count(a.prob) > 0 then json_agg(a.prob) end as answer_probs
    from contracts c
           left join answers a on c.id = a.contract_id
    ${whereClause}
    group by c.id
       `
  const convertRow = (row: any) => {
    const { answer_probs, ...rest } = row
    const contractData = {
      answers: answer_probs?.map((p: number) => ({ prob: p as number })) ?? [],
      ...rest,
    }
    return convertContract(contractData)
  }
  const activeContracts = await pg.map(
    select(
      'where last_bet_time > millis_to_ts($1) or last_comment_time > millis_to_ts($1)'
    ),
    [now - IMPORTANCE_MINUTE_INTERVAL * MINUTE_MS],
    convertRow
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContracts = await pg.map(
    select(
      'where importance_score > $1 or freshness_score > $1 or c.resolution_time is null'
    ),
    [MIN_IMPORTANCE_SCORE],
    convertRow
  )

  const activeContractIds = activeContracts.map((c) => c.id)
  const previouslyActiveContractsFiltered = (
    previouslyActiveContracts ?? []
  ).filter((c) => !activeContractIds.includes(c.id))

  const contracts = activeContracts.concat(previouslyActiveContractsFiltered)
  const contractIds = contracts.map((c) => c.id)

  log(
    `Found ${contracts.length} contracts to score`,
    'including',
    previouslyActiveContracts.length,
    'previously active contracts'
  )

  const todayComments = await getTodayComments(pg)
  const todayLikesByContract = await getRecentContractLikes(pg, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(pg, weekAgo)

  const todayTradersByContract = {
    ...(await getContractTraders(pg, dayAgo, contractIds)),
    ...(await getContractVoters(pg, dayAgo, contractIds)),
  }

  const hourAgoTradersByContract = {
    ...(await getContractTraders(pg, hourAgo, contractIds)),
    ...(await getContractVoters(pg, hourAgo, contractIds)),
  }

  const thisWeekTradersByContract = {
    ...(await getContractTraders(pg, weekAgo, contractIds)),
    ...(await getContractVoters(pg, weekAgo, contractIds)),
  }

  const contractsWithUpdates: Contract[] = []
  const marketComponents: any[] = []

  for (const contract of contracts) {
    const {
      importanceScore,
      freshnessScore,
      dailyScore,
      rawMarketImportanceBreakdown,
    } = computeContractScores(
      now,
      contract,
      todayComments[contract.id] ?? 0,
      todayLikesByContract[contract.id] ?? 0,
      thisWeekLikesByContract[contract.id] ?? 0,
      todayTradersByContract[contract.id] ?? 0,
      hourAgoTradersByContract[contract.id] ?? 0,
      thisWeekTradersByContract[contract.id] ?? 0
    )

    if (isNaN(dailyScore)) {
      log.error('NaN daily score for contract ' + contract.id)
    }
    if (isNaN(freshnessScore)) {
      log.error('NaN freshness score for contract ' + contract.id)
    }
    if (isNaN(importanceScore)) {
      log.error('NaN importance score for contract ' + contract.id)
    }

    const epsilon = 0.01
    // NOTE: These scores aren't updated in firestore, so are never accurate in the data blob
    if (
      rescoreAll ||
      !floatingEqual(importanceScore, contract.importanceScore, epsilon) ||
      !floatingEqual(freshnessScore, contract.freshnessScore, epsilon) ||
      !floatingEqual(dailyScore, contract.dailyScore, epsilon)
    ) {
      contract.importanceScore = importanceScore
      contract.freshnessScore = freshnessScore
      contract.dailyScore = dailyScore
      contractsWithUpdates.push(contract)
      marketComponents.push(rawMarketImportanceBreakdown)
    }
  }

  // sort in descending order by score
  contractsWithUpdates.sort((a, b) => b.importanceScore - a.importanceScore)

  console.log('Found', contractsWithUpdates.length, 'contracts to update')

  if (
    contractsWithUpdates.filter(
      (c) => c.importanceScore < 0 || c.importanceScore > 1
    ).length !== 0
  )
    log('WARNING: some scores are out of bounds')

  log('')
  log('Top 30 contracts by score')

  const topContracts = contractsWithUpdates.slice(0, 40).map((contract) => {
    const breakdown =
      marketComponents.find((mc) => mc.contractId === contract.id) || {}
    return {
      Question: contract.question.slice(0, 40),
      Total: contract.importanceScore.toFixed(2),
      '24h v': breakdown.volume24HoursComponent?.toFixed(2) || '',
      'Trader hr': breakdown.traderHourComponent?.toFixed(2) || '',
      Today: breakdown.todayScoreComponent?.toFixed(2) || '',
      Liq: breakdown.liquidityScore?.toFixed(2) || '',
      Newness: breakdown.newness?.toFixed(2) || '',
      Mvmt: breakdown.marketMovtComponent?.toFixed(2) || '',
      Closing: breakdown.closingSoonnnessComponent?.toFixed(2) || '',
      Comments: breakdown.commentScore?.toFixed(2) || '',
      Week: breakdown.thisWeekScoreComponent?.toFixed(2) || '',
      Uniques: breakdown.uniqueBettorComponent?.toFixed(2) || '',
      Volume: breakdown.volumeComponent?.toFixed(2) || '',
      Uncertainty: breakdown.uncertainness?.toFixed(2) || '',
      Conversion: breakdown.conversionScore?.toFixed(2) || '',
      Ranked: breakdown.rankedScore?.toFixed(2) || '',
    }
  })

  console.table(topContracts)
  log('')
  log('Bottom 5 contracts by score')
  contractsWithUpdates
    .slice()
    .reverse()
    .slice(0, 5)
    .forEach((contract) => {
      log(
        contract.importanceScore,
        contract.question,
        contract.token === 'CASH' ? '[sweep]' : ''
      )
    })

  // Sort in descending order by freshness
  const freshest = sortBy(
    contractsWithUpdates,
    (c) => -1 * (c.freshnessScore ?? 0)
  )
  log('')
  log('Top 30 contracts by freshness')

  const freshestContracts = freshest.slice(0, 40).map((contract) => {
    const breakdown =
      marketComponents.find((mc) => mc.contractId === contract.id) || {}
    return {
      Question: contract.question.slice(0, 40),
      'Fresh Score': contract.freshnessScore.toFixed(2),
      '24h volume': breakdown.freshVolume24h?.toFixed(2) || '',
      Today: breakdown.freshTodayScore?.toFixed(2) || '',
      'Last Updated': breakdown.freshLastUpdated?.toFixed(2) || '',
      'Conversion Score': breakdown.conversionScore?.toFixed(2) || '',
      Ranked: breakdown.rankedScore?.toFixed(2) || '',
    }
  })

  console.table(freshestContracts)
  log('')
  log('Bottom 5 contracts by freshness')
  freshest
    .slice()
    .reverse()
    .slice(0, 5)
    .forEach((contract) => {
      log(
        contract.freshnessScore,
        contract.question,
        contract.token === 'CASH' ? '[sweep]' : ''
      )
    })

  if (!readOnly) {
    log('')
    log('Updating', contractsWithUpdates.length, 'contracts')
    await bulkUpdate(
      pg,
      'contracts',
      ['id'],
      contractsWithUpdates.map((contract) => ({
        id: contract.id,
        importance_score: contract.importanceScore,
        freshness_score: contract.freshnessScore,
        daily_score: contract.dailyScore,
      }))
    )
  }
}

export const getTodayComments = async (pg: SupabaseDirectClient) => {
  const counts = await pg.func<
    { contract_id: string; comment_count: number }[]
  >('count_recent_comments_by_contract')

  return Object.fromEntries(counts.map((c) => [c.contract_id, c.comment_count]))
}

export const getContractTraders = async (
  pg: SupabaseDirectClient,
  since: number,
  inContractIds: string[]
) => {
  return Object.fromEntries(
    await pg.map(
      `select cb.contract_id, count(distinct cb.user_id)::int as n
       from contract_bets cb
                join users u on cb.user_id = u.id
       where cb.created_time >= millis_to_ts($1)
         and u.username <> ANY(ARRAY[$2])
          and cb.contract_id = ANY(ARRAY[$3])
       group by cb.contract_id`,
      [since, BOT_USERNAMES, inContractIds],
      (r) => [r.contract_id as string, r.n as number]
    )
  )
}

export const getContractVoters = async (
  pg: SupabaseDirectClient,
  since: number,
  inContractIds: string[]
) => {
  return Object.fromEntries(
    await pg.map(
      `select cb.contract_id, count(distinct cb.user_id)::int as n
       from votes cb
                join users u on cb.user_id = u.id
       where cb.created_time >= millis_to_ts($1)
         and u.username <> ANY(ARRAY[$2])
          and cb.contract_id = ANY(ARRAY[$3])
       group by cb.contract_id`,
      [since, BOT_USERNAMES, inContractIds],
      (r) => [r.contract_id as string, r.n as number]
    )
  )
}

export const computeContractScores = (
  now: number,
  contract: Contract,
  commentsToday: number,
  likesToday: number,
  likesWeek: number,
  tradersToday: number,
  traderHour: number,
  tradersWeek: number
) => {
  const todayScore = likesToday + tradersToday
  const thisWeekScore = likesWeek + tradersWeek
  const thisWeekScoreWeight = thisWeekScore / 10
  const popularityScore = todayScore + thisWeekScoreWeight
  const wasCreatedToday = contract.createdTime > now - DAY_MS

  const { createdTime, closeTime, isResolved, resolutionTime, outcomeType } =
    contract
  const resolvedOverADayAgo = resolutionTime && resolutionTime < now - DAY_MS
  const commentScore = commentsToday
    ? normalize(Math.log10(1 + commentsToday), Math.log10(50))
    : 0

  const newness =
    !isResolved && wasCreatedToday
      ? normalize(24 - (now - createdTime) / (1000 * 60 * 60), 24)
      : 0

  const closingSoonnness =
    !wasCreatedToday &&
    !isResolved &&
    closeTime &&
    closeTime > now &&
    outcomeType !== 'STONK'
      ? closeTime <= now + DAY_MS
        ? 1
        : closeTime <= now + WEEK_MS
        ? 0.8
        : closeTime <= now + MONTH_MS
        ? 0.5
        : closeTime <= now + MONTH_MS * 3
        ? 0.25
        : closeTime <= now + YEAR_MS
        ? 0.1
        : 0
      : 0

  const liquidityScore = isResolved
    ? 0
    : normalize(clamp(1 / contract.elasticity, 0, 100), 100)

  let uncertainness = 0

  if (!isResolved) {
    if (contract.mechanism === 'cpmm-1') {
      const { prob } = contract
      uncertainness = normalize(prob * (1 - prob), 0.25)
    } else if (contract.mechanism === 'cpmm-multi-1') {
      const { answers, shouldAnswersSumToOne } = contract
      const probs = sortBy(answers.map((a) => a.prob)).reverse()
      if (probs.length === 0) {
        uncertainness = 0
      } else if (!shouldAnswersSumToOne) {
        // for independent binary markets
        uncertainness = max(probs.map((p) => normalize(p * (1 - p), 0.25))) ?? 0
      } else if (probs.length < 3) {
        const prob = probs[0]
        uncertainness = normalize(prob * (1 - prob), 0.25)
      } else {
        const [p1, p2] = probs.slice(0, 2)
        const product = p1 * p2 * (1 - p1 - p2)
        uncertainness = normalize(product, 1 / 3 ** 3)
      }
    }
  }

  let dailyScore = 0
  let logOddsChange = 0

  if (contract.mechanism === 'cpmm-1' && !wasCreatedToday) {
    const { prob, probChanges } = contract
    const yesterdayProb = clamp(prob - probChanges.day, 0.01, 0.99)
    const todayProb = clamp(prob, 0.01, 0.99)
    logOddsChange = Math.abs(logit(yesterdayProb) - logit(todayProb))
    dailyScore = Math.log(thisWeekScore + 1) * logOddsChange
  }

  const marketMovt =
    normalize(logOddsChange, 5) * normalize(contract.uniqueBettorCount, 10) // ignore movt on small markets

  const conversionScore = normalize(contract.conversionScore, 1)

  const volume24HoursComponent =
    3 * normalize(Math.log10(contract.volume24Hours + 1), 6)
  const traderHourComponent = 2 * normalize(traderHour, 20)
  const todayScoreComponent = 2 * normalize(todayScore, 100)
  const liquidityScoreComponent = liquidityScore
  const newnessComponent = newness
  const marketMovtComponent = 3 * marketMovt
  const closingSoonnnessComponent = 2 * closingSoonnness
  const commentScoreComponent = commentScore
  const thisWeekScoreComponent = normalize(thisWeekScore, 100)
  const uniqueBettorComponent = normalize(contract.uniqueBettorCount, 1000) / 2
  const volumeComponent = resolvedOverADayAgo
    ? 0
    : normalize(Math.log10(contract.volume + 1), 7) * 0.75
  const uncertainnessComponent = uncertainness / 2
  const conversionScoreComponent = resolvedOverADayAgo ? 0 : conversionScore
  const rankedScore = isMarketRanked(contract) ? 0 : -1

  const computedRawMarketImportance =
    volume24HoursComponent +
    traderHourComponent +
    todayScoreComponent +
    liquidityScoreComponent +
    newnessComponent +
    marketMovtComponent +
    closingSoonnnessComponent +
    commentScoreComponent +
    thisWeekScoreComponent +
    uniqueBettorComponent +
    volumeComponent +
    uncertainnessComponent +
    conversionScoreComponent +
    rankedScore

  const rawPollImportance =
    2 * normalize(traderHour, 20) +
    2 * normalize(todayScore, 100) +
    2 * newness +
    commentScore +
    normalize(thisWeekScore, 200) +
    normalize(contract.uniqueBettorCount, 1000)

  const importanceScore =
    outcomeType === 'BOUNTIED_QUESTION'
      ? bountiedImportanceScore(contract, newness, commentScore)
      : outcomeType === 'POLL'
      ? normalize(rawPollImportance, 5) // increase max as polls catch on
      : normalize(computedRawMarketImportance, 8)

  // Calculate freshness components
  const todayRatio = todayScore / (thisWeekScore - todayScore + 1)
  const hourRatio = traderHour / (thisWeekScore - traderHour + 1)
  const freshnessFactor = clamp((todayRatio + 5 * hourRatio) / 5, 0.05, 1) // Reduced multiplier for hourRatio

  const freshVolume24h =
    (contract.volume24Hours / (contract.volume + 1)) *
    normalize(Math.log10(contract.volume24Hours + 1), 5)
  const freshTodayScore = normalize(todayScore, 10)
  const freshLastUpdated =
    normalize(0.05 - (now - contract.lastUpdatedTime) / DAY_MS, 0.05) / 2

  const rawMarketFreshness =
    freshVolume24h +
    freshTodayScore +
    freshLastUpdated +
    conversionScoreComponent / 2 +
    rankedScore

  const rawMarketImportanceBreakdown = {
    contractId: contract.id,
    volume24HoursComponent,
    traderHourComponent,
    todayScoreComponent,
    liquidityScore: liquidityScoreComponent,
    newness: newnessComponent,
    marketMovtComponent,
    closingSoonnnessComponent,
    commentScore: commentScoreComponent,
    thisWeekScoreComponent,
    uniqueBettorComponent,
    volumeComponent,
    uncertainness: uncertainnessComponent,
    conversionScore: conversionScoreComponent,
    rankedScore,
    // Freshness components
    freshVolume24h,
    freshTodayScore,
    freshLastUpdated,
  }

  const freshnessScore =
    outcomeType === 'POLL' || outcomeType === 'BOUNTIED_QUESTION'
      ? freshnessFactor * importanceScore
      : normalize(rawMarketFreshness, 3)

  return {
    todayScore,
    thisWeekScore,
    popularityScore: popularityScore >= 1 ? popularityScore : 0,
    freshnessScore,
    dailyScore,
    importanceScore,
    logOddsChange,
    rawMarketImportanceBreakdown,
  }
}

const bountiedImportanceScore = (
  contract: BountiedQuestionContract,
  newness: number,
  commentScore: number
) => {
  const { totalBounty, bountyLeft } = contract

  const bountyScore = normalize(Math.log10(totalBounty + 1), 5)
  const bountyLeftScore = normalize(Math.log10(bountyLeft + 1), 5)

  const rawImportance =
    3 * commentScore + newness + bountyScore + bountyLeftScore

  return normalize(rawImportance, 6)
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

const normalize = (x: number, max: number) => sigmoid((6 * x) / max - 3)
