import { User } from 'common/user'
import {
  getQuestWeekStart,
  MARKET_CREATION_QUESTS,
  QUEST_DETAILS,
  QuestType,
} from 'common/quest'
import { QuestRewardTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError } from 'common//api/utils'
import { createQuestPayoutNotification } from 'shared/create-notification'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { getQuestScore, setQuestScoreValue } from 'common/supabase/set-scores'
import { millisToTs } from 'common/supabase/utils'
import { log } from 'shared/utils'
import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
} from 'common/supporter-config'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'

dayjs.extend(utc)
dayjs.extend(timezone)

export const completeSharingQuest = async (user: User) => {
  const db = createSupabaseClient()
  const count = await getCurrentCountForQuest(user.id, 'SHARES')
  const oldEntry = await getQuestScore(user.id, 'SHARES', db)
  return await completeQuestInternal(
    user,
    'SHARES',
    oldEntry.score,
    count,
    undefined
  )
}

// Runs after each question a user creates. Updates their questions-this-week
// count and pays every weekly creation quest (1 question, 3 questions) whose
// requiredCount the count has reached and that hasn't paid out this week.
export const completeMarketCreationQuests = async (
  user: User,
  // idempotencyKey is used to prevent duplicate quest completions from triggers firing multiple times
  idempotencyKey: string,
  contractId: string
) => {
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const oldEntry = await getQuestScore(user.id, 'MARKETS_CREATED', db)
  log('current quest entry:', oldEntry, 'for user:', user.id)
  if (idempotencyKey && oldEntry.idempotencyKey === idempotencyKey)
    return { count: oldEntry.score }

  const weekStart = getQuestWeekStart()
  // Counts this contract even if the query can't see it yet.
  const { count } = await pg.one<{ count: number }>(
    `select count(*)::int + 1 as count from contracts
    where creator_id = $1
    and created_time >= millis_to_ts($2)
    and id != $3`,
    [user.id, weekStart, contractId]
  )
  log(
    'markets created this week count:',
    count,
    'for user:',
    user.id,
    'and idempotencyKey:',
    idempotencyKey
  )
  await setQuestScoreValue(
    user.id,
    QUEST_DETAILS.MARKETS_CREATED.scoreId,
    count,
    db,
    idempotencyKey
  )

  const reached = MARKET_CREATION_QUESTS.filter(
    (questType) => count >= QUEST_DETAILS[questType].requiredCount
  )
  if (reached.length === 0) return { count }
  // Unlocked pre-check, so prolific creators don't take the user row lock on
  // every question. awardQuestBonus re-checks under the lock.
  const paid = await getQuestTypesPaidSince(pg, user.id, weekStart)
  for (const questType of reached) {
    if (paid.includes(questType)) continue
    const resp = await awardQuestBonus(user, questType, count, weekStart)
    if (!resp) continue
    if (!resp.txn) {
      log(`Quest bonus rounded to zero for user ${user.id} (${questType})`)
      continue
    }
    await createQuestPayoutNotification(
      user,
      resp.txn.id,
      resp.bonusAmount,
      count,
      questType
    )
  }
  return { count }
}

const completeQuestInternal = async (
  user: User,
  questType: QuestType,
  oldScore: number,
  count: number,
  idempotencyKey: string | undefined
) => {
  const db = createSupabaseClient()
  const questDetails = QUEST_DETAILS[questType]
  await setQuestScoreValue(
    user.id,
    questDetails.scoreId,
    count,
    db,
    idempotencyKey
  )
  const startOfDay = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()
  log('completing quest', {
    questType,
    userId: user.id,
    oldScore,
    newScore: count,
    startOfDay,
    requiredCount: questDetails.requiredCount,
  })
  // If they have created the required amounts, send them a quest txn reward.
  // All users receive a quest bonus, but the amount scales with their effective
  // tier (flagged = 0, bonus-blocked = 0.2x, free = 1x, subscribers higher).
  if (count !== oldScore && count === QUEST_DETAILS[questType].requiredCount) {
    const resp = await awardQuestBonus(user, questType, count, startOfDay)
    if (!resp) throw new APIError(400, 'Already awarded quest bonus today')
    if (!resp.txn) {
      log(`Quest bonus rounded to zero for user ${user.id} (${questType})`)
      return { count }
    }

    await createQuestPayoutNotification(
      user,
      resp.txn.id,
      resp.bonusAmount,
      count,
      questType
    )
    return resp
  }
  return { count }
}

const getCurrentCountForQuest = async (
  userId: string,
  questType: 'SHARES'
): Promise<number> => {
  if (questType === 'SHARES') {
    const startOfDay = dayjs()
      .tz('America/Los_Angeles')
      .startOf('day')
      .valueOf()
    const startTs = millisToTs(startOfDay)
    log('getting shares count for user', userId, 'from startTs', startTs)
    return await getUserShareEventsCount(userId, startTs)
  } else return 0
}

const getQuestTypesPaidSince = async (
  pg: SupabaseDirectClient,
  userId: string,
  since: number
) =>
  await pg.map(
    `select distinct data->'data'->>'questType' as quest_type from txns
    where to_id = $1
    and category = 'QUEST_REWARD'
    and created_time >= millis_to_ts($2)`,
    [userId, since],
    (row) => row.quest_type as QuestType
  )

// Pays the quest's bonus once per period. Returns null if it already paid out
// since periodStart, and no txn if the tier multiplier makes the bonus zero.
const awardQuestBonus = async (
  user: User,
  questType: QuestType,
  newCount: number,
  periodStart: number
) => {
  const pg = createSupabaseDirectClient()
  return await pg.tx(async (tx) => {
    // Lock the user row to serialize concurrent quest reward grants for this
    // user. Without this, two concurrent /completequest calls (or two
    // questions created at once) can both pass the previousTxn check below and
    // both insert reward txns.
    await tx.oneOrNone('select 1 from users where id = $1 for update', [user.id])

    // make sure we don't already have a txn for this user/questType this period
    const previousTxn = await tx.oneOrNone(
      `select 1 from txns
      where to_id = $1
      and category = 'QUEST_REWARD'
      and data->'data'->>'questType' = $2
      and created_time >= millis_to_ts($3)
      limit 1`,
      [user.id, questType, periodStart]
    )
    if (previousTxn) return null

    // Fetch user's supporter entitlements for bonus multiplier
    const entitlements = await getActiveSupporterEntitlements(tx, user.id)

    // Resolve effective tier (account standing + subscription) and apply its
    // multiplier.
    const effectiveTier = resolveEffectiveTier({
      entitlements,
      bonusEligibility: user.bonusEligibility,
    })
    const questMultiplier = getEffectiveBonusMultiplier(effectiveTier, 'quest')
    const baseReward = QUEST_DETAILS[questType].rewardAmount
    const rewardAmount = roundTierBonus(baseReward * questMultiplier)
    // runTxn rejects non-positive amounts (flagged accounts earn 0x).
    if (!(rewardAmount > 0)) return { txn: undefined, bonusAmount: 0 }

    const bonusTxnData = {
      questType,
      questCount: newCount,
      effectiveTier,
      questMultiplier,
      supporterBonus: questMultiplier > 1,
    }

    const bonusTxn: Omit<QuestRewardTxn, 'fromId' | 'id' | 'createdTime'> = {
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: rewardAmount,
      token: 'M$',
      category: 'QUEST_REWARD',
      data: bonusTxnData,
    }
    const txn = await runTxnFromBank(tx, bonusTxn)
    return { txn, bonusAmount: rewardAmount }
  })
}

export async function getUserShareEventsCount(userId: string, startTs: string) {
  const pg = createSupabaseDirectClient()
  const res = await pg.one(
    `select count(*)::int from user_contract_interactions
                where user_id = $1 and name = 'page share'
                  and created_time >= $2`,
    [userId, startTs]
  )
  return res.count
}
