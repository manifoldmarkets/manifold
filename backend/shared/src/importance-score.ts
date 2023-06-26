import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient } from 'common/supabase/utils'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { loadPaginated, log } from 'shared/utils'
import { Query } from 'firebase-admin/lib/firestore'
import { Contract } from 'common/contract'
import { getRecentContractLikes } from 'shared/supabase/likes'
import { clamp } from 'lodash'
import { logit } from 'common/util/math'

import { BOT_USERNAMES } from 'common/envs/constants'

export const IMPORTANCE_MINUTE_INTERVAL = 2

export async function calculateImportanceScore(
  firestore: FirebaseFirestore.Firestore,
  db: SupabaseClient,
  pg: SupabaseDirectClient,
  readOnly = false
) {
  const now = Date.now()
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS

  const activeContracts = await loadPaginated(
    firestore
      .collection('contracts')
      .where('lastUpdatedTime', '>', dayAgo) as Query<Contract>
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContractsData = await db
    .from('contracts')
    .select('data')
    .or('data->>importanceScore.gt.0.2')

  const activeContractIds = activeContracts.map((c) => c.id)
  const previouslyActiveContracts = (previouslyActiveContractsData.data ?? [])
    .map((row) => row.data as Contract)
    .filter((c) => !activeContractIds.includes(c.id))

  const contracts = activeContracts.concat(previouslyActiveContracts)
  log(
    `Found ${contracts.length} contracts to score`,
    'including',
    previouslyActiveContracts.length,
    'previously active contracts'
  )

  const todayLikesByContract = await getRecentContractLikes(db, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(db, weekAgo)
  const todayTradersByContract = await getContractTraders(pg, dayAgo)
  const hourAgoTradersByContract = await getContractTraders(pg, hourAgo)
  const thisWeekTradersByContract = await getContractTraders(pg, weekAgo)

  const updates: [number, Contract, Partial<Contract>][] = []

  for (const contract of contracts) {
    const { popularityScore, dailyScore, importanceScore } =
      computeContractScores(
        now,
        contract,
        todayLikesByContract[contract.id] ?? 0,
        thisWeekLikesByContract[contract.id] ?? 0,
        todayTradersByContract[contract.id] ?? 0,
        hourAgoTradersByContract[contract.id] ?? 0,
        thisWeekTradersByContract[contract.id] ?? 0
      )

    if (contract.importanceScore !== importanceScore) {
      updates.push([
        importanceScore,
        contract,
        { popularityScore, dailyScore, importanceScore },
      ])
    }
  }

  // sort in descending order by score
  updates.sort((a, b) => b[0] - a[0])

  console.log('Found', updates.length, 'contracts to update')

  if (updates.filter(([s]) => s < 0 || s > 1).length !== 0)
    console.log('WARNING: some scores are out of bounds')

  console.log('Top 15 contracts by score')

  updates.slice(0, 15).forEach(([score, contract]) => {
    console.log(score, contract.question)
  })

  console.log('Bottom 5 contracts by score')
  updates
    .slice()
    .reverse()
    .slice(0, 5)
    .forEach(([score, contract]) => {
      console.log(score, contract.question)
    })

  if (!readOnly) await batchUpdates(firestore, updates)
}

const batchUpdates = async (
  firestore: FirebaseFirestore.Firestore,
  updates: [number, Contract, Partial<Contract>][]
) => {
  let batch = firestore.batch()

  for (let i = 0; i < updates.length; i++) {
    const [_, contract, updateObj] = updates[i]

    const contractRef = firestore.collection('contracts').doc(contract.id)
    batch.update(contractRef, updateObj)

    if (i % 400 === 0) {
      await batch.commit()
      batch = firestore.batch()
    }
  }

  await batch.commit()
}

export const getContractTraders = async (
  pg: SupabaseDirectClient,
  since: number
) => {
  return Object.fromEntries(
    await pg.map(
      `select cb.contract_id, count(distinct cb.user_id)::int as n
       from contract_bets cb
                join users u on cb.user_id = u.id
       where cb.created_time >= millis_to_ts($1)
         and u.username <> ANY(ARRAY[$2])
       group by cb.contract_id`,
      [since, BOT_USERNAMES],
      (r) => [r.contract_id as string, r.n as number]
    )
  )
}

export const computeContractScores = (
  now: number,
  contract: Contract,
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

  const { closeTime, isResolved } = contract

  const newness =
    !isResolved && wasCreatedToday
      ? normalize(24 - (now - contract.createdTime) / (1000 * 60 * 60), 24)
      : 0

  const closingSoonnness =
    !isResolved &&
    closeTime &&
    closeTime > now &&
    closeTime - now < 1000 * 60 * 60 * 24
      ? normalize(24 - (closeTime - now) / (1000 * 60 * 60), 24)
      : 0

  const liquidityScore = isResolved
    ? 0
    : normalize(clamp(1 / contract.elasticity, 0, 100), 100)

  // recalibrate all of these numbers as site usage changes
  const rawImportance =
    3 * marketMovt +
    2 * newness +
    2 * normalize(traderHour, 20) +
    2 * normalize(todayScore, 100) +
    normalize(thisWeekScore, 200) +
    normalize(Math.log10(contract.volume24Hours), 5) +
    normalize(contract.uniqueBettorCount, 1000) +
    normalize(Math.log10(contract.volume), 7) +
    liquidityScore +
    closingSoonnness

  const importanceScore = normalize(rawImportance, 6)

  return {
    todayScore,
    thisWeekScore,
    popularityScore,
    freshnessScore,
    dailyScore,
    importanceScore,
  }
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

const normalize = (x: number, max: number) => sigmoid((6 * x) / max - 3)
