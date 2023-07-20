import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient } from 'common/supabase/utils'
import { DAY_MS, HOUR_MS, MINUTE_MS, MONTH_MS, WEEK_MS, YEAR_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { BountiedQuestionContract, Contract } from 'common/contract'
import { getRecentContractLikes } from 'shared/supabase/likes'
import { clamp, sortBy } from 'lodash'
import { logit } from 'common/util/math'

import { BOT_USERNAMES } from 'common/envs/constants'
import { bulkUpdate } from 'shared/supabase/utils'

export const IMPORTANCE_MINUTE_INTERVAL = 2

export async function calculateImportanceScore(
  db: SupabaseClient,
  pg: SupabaseDirectClient,
  readOnly = false
) {
  const now = Date.now()
  const lastUpdatedTime = now - IMPORTANCE_MINUTE_INTERVAL * MINUTE_MS
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS

  const activeContracts = await pg.map(
    `select data from contracts where ((data->'lastUpdatedTime')::numeric) > $1`,
    [lastUpdatedTime],
    (row) => row.data as Contract
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContracts = await pg.map(
    `select data from contracts where importance_score > 0.2`,
    [],
    (row) => row.data as Contract
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

  const todayComments = await getTodayComments(db)
  const todayLikesByContract = await getRecentContractLikes(db, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(db, weekAgo)
  const todayTradersByContract = await getContractTraders(
    pg,
    dayAgo,
    contractIds
  )
  const hourAgoTradersByContract = await getContractTraders(
    pg,
    hourAgo,
    contractIds
  )
  const thisWeekTradersByContract = await getContractTraders(
    pg,
    weekAgo,
    contractIds
  )

  const contractsWithUpdates: Contract[] = []

  for (const contract of contracts) {
    const { importanceScore, popularityScore, dailyScore } =
      computeContractScores(
        now,
        contract,
        todayComments[contract.id] ?? 0,
        todayLikesByContract[contract.id] ?? 0,
        thisWeekLikesByContract[contract.id] ?? 0,
        todayTradersByContract[contract.id] ?? 0,
        hourAgoTradersByContract[contract.id] ?? 0,
        thisWeekTradersByContract[contract.id] ?? 0
      )

    if (
      contract.importanceScore !== importanceScore ||
      contract.popularityScore !== popularityScore ||
      contract.dailyScore !== dailyScore
    ) {
      contract.importanceScore = importanceScore
      contract.popularityScore = popularityScore
      contract.dailyScore = dailyScore
      contractsWithUpdates.push(contract)
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
    console.log('WARNING: some scores are out of bounds')

  console.log('Top 15 contracts by score')

  contractsWithUpdates.slice(0, 15).forEach((contract) => {
    console.log(contract.importanceScore, contract.question)
  })

  console.log('Bottom 5 contracts by score')
  contractsWithUpdates
    .slice()
    .reverse()
    .slice(0, 5)
    .forEach((contract) => {
      console.log(contract.importanceScore, contract.question)
    })

  if (!readOnly)
    await bulkUpdate(
      pg,
      'contracts',
      ['id'],
      contractsWithUpdates.map((contract) => ({
        id: contract.id,
        data: `${JSON.stringify(contract)}::jsonb`,
        importance_score: contract.importanceScore,
        popularity_score: contract.popularityScore,
      }))
    )
}

export const getTodayComments = async (db: SupabaseClient) => {
  const counts = await db
    .rpc('count_recent_comments_by_contract' as any)
    .then((res) =>
      (res.data ?? []).map(({ contract_id, comment_count }) => [
        contract_id,
        comment_count,
      ])
    )

  return Object.fromEntries(counts)
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
  const freshnessScore = 1 + Math.log(1 + popularityScore)
  const wasCreatedToday = contract.createdTime > now - DAY_MS

  const { createdTime, closeTime, isResolved, outcomeType } = contract

  const commentScore = commentsToday
    ? normalize(Math.log10(1 + commentsToday), Math.log10(50))
    : 0

  const newness =
    !isResolved && wasCreatedToday
      ? normalize(24 - (now - createdTime) / (1000 * 60 * 60), 24)
      : 0

  const closingSoonnness =
    !isResolved && closeTime && closeTime > now
      ? closeTime <= now + DAY_MS
        ? 1
        : closeTime <= now + WEEK_MS
        ? 0.9
        : closeTime <= now + MONTH_MS
        ? 0.75
        : closeTime <= now + MONTH_MS * 3
        ? 0.5
        : closeTime <= now + YEAR_MS
        ? 0.33
        : 0.25
      : 0

  const liquidityScore = isResolved
    ? 0
    : normalize(clamp(1 / contract.elasticity, 0, 100), 100)

  let uncertainness = 0.5
  if (contract.mechanism === 'cpmm-1') {
    const { prob } = contract
    uncertainness = normalize(prob * (1 - prob), 0.25)
  } else if (contract.mechanism === 'cpmm-multi-1') {
    const { answers } = contract
    const probs = sortBy(answers.map((a) => a.prob)).reverse()
    if (probs.length < 3) {
      const prob = probs[0]
      uncertainness = normalize(prob * (1 - prob), 0.25)
    } else {
      const [p1, p2] = probs.slice(0, 2)
      const product = p1 * p2 * (1 - p1 - p2)
      uncertainness = normalize(product, 1 / 3 ** 3)
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

  // recalibrate all of these numbers as site usage changes
  const rawImportance =
    3 * normalize(traderHour, 20) +
    2 * normalize(todayScore, 100) +
    2 * marketMovt +
    newness +
    commentScore +
    normalize(thisWeekScore, 200) +
    normalize(Math.log10(contract.volume24Hours), 5) +
    normalize(contract.uniqueBettorCount, 1000) +
    normalize(Math.log10(contract.volume), 7) +
    liquidityScore +
    closingSoonnness * 2 +
    uncertainness / 2

  const importanceScore =
    outcomeType === 'BOUNTIED_QUESTION'
      ? bountiedImportanceScore(contract, newness, commentScore)
      : normalize(rawImportance, 7)

  return {
    todayScore,
    thisWeekScore,
    popularityScore: popularityScore >= 1 ? popularityScore : 0,
    freshnessScore,
    dailyScore,
    importanceScore,
    logOddsChange,
  }
}

const bountiedImportanceScore = (
  contract: BountiedQuestionContract,
  newness: number,
  commentScore: number
) => {
  const { totalBounty, bountyLeft } = contract

  const bountyScore = normalize(Math.log10(totalBounty), 5)
  const bountyLeftScore = normalize(Math.log10(bountyLeft), 5)

  const rawImportance =
    3 * commentScore + newness + bountyScore + bountyLeftScore

  return normalize(rawImportance, 6)
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

const normalize = (x: number, max: number) => sigmoid((6 * x) / max - 3)
