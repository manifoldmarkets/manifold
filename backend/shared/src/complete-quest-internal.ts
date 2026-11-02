import { User } from 'common/user'
import { Contract } from 'common/contract'
import {
  getNextQuestWeekStart,
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

// Runs after each question a user creates. Counts their questions in the week
// the question was created (not the week this runs in, so a late trigger for a
// Sunday-night question still counts toward Sunday's week) and pays the weekly
// creation quests that count has reached. Safe to rerun: each quest pays at
// most once per week.
export const completeMarketCreationQuests = async (
  user: User,
  contract: Pick<Contract, 'id' | 'createdTime'>
) => {
  const pg = createSupabaseDirectClient()
  const weekStart = getQuestWeekStart(new Date(contract.createdTime))
  // Counts this contract even if the query can't see it yet.
  const { count } = await pg.one<{ count: number }>(
    `select count(*)::int + 1 as count from contracts
    where creator_id = $1
    and created_time >= millis_to_ts($2)
    and created_time < millis_to_ts($3)
    and id != $4`,
    [user.id, weekStart, getNextQuestWeekStart(weekStart), contract.id]
  )
  log('markets created this week count:', count, 'for user:', user.id, {
    contractId: contract.id,
    weekStart,
  })
  // The score only shows the current week's progress in the quests modal.
  if (weekStart === getQuestWeekStart()) {
    await setQuestScoreValue(
      user.id,
      QUEST_DETAILS.MARKETS_CREATED.scoreId,
      count,
      createSupabaseClient()
    )
  }
  await payMarketCreationQuests(user, weekStart, count)
  return { count }
}

// The weekly creation quests a user with `count` questions in the week
// starting at weekStart has earned but not yet been paid.
export const getUnpaidMarketCreationQuests = async (
  pg: SupabaseDirectClient,
  userId: string,
  weekStart: number,
  count: number
) => {
  const reached = MARKET_CREATION_QUESTS.filter(
    (questType) => count >= QUEST_DETAILS[questType].requiredCount
  )
  if (reached.length === 0) return []
  const paid = await getQuestTypesPaidForPeriod(pg, userId, weekStart)
  return reached.filter((questType) => !paid.includes(questType))
}

export const payMarketCreationQuests = async (
  user: User,
  weekStart: number,
  count: number
) => {
  // Unlocked pre-check, so prolific creators don't take the user row lock on
  // every question. awardQuestBonus re-checks under the lock.
  const unpaid = await getUnpaidMarketCreationQuests(
    createSupabaseDirectClient(),
    user.id,
    weekStart,
    count
  )
  for (const questType of unpaid) {
    const resp = await awardQuestBonus(user, questType, count, weekStart)
    if (!resp) continue
    if (!resp.txn) {
      log(`Quest bonus rounded to zero for user ${user.id} (${questType})`)
      continue
    }
    // The reward is already paid, so a failed notification mustn't stop the
    // next quest's payout.
    await createQuestPayoutNotification(
      user,
      resp.txn.id,
      resp.bonusAmount,
      count,
      questType
    ).catch((e) =>
      log.error('Failed to create quest payout notification', {
        userId: user.id,
        questType,
        error: e instanceof Error ? e.message : String(e),
      })
    )
  }
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

// A reward paid for the period starting at periodStart: it records that
// periodStart, or, if paid before rewards recorded one, was paid after it.
// A reward for an earlier period paid late (just past the boundary) records
// its own period, so it doesn't block this one.
const PAID_FOR_PERIOD_SQL = `
  created_time >= millis_to_ts($/periodStart/)
  and coalesce((data->'data'->>'periodStart')::bigint, $/periodStart/) = $/periodStart/`

const getQuestTypesPaidForPeriod = async (
  pg: SupabaseDirectClient,
  userId: string,
  periodStart: number
) =>
  await pg.map(
    `select distinct data->'data'->>'questType' as quest_type from txns
    where to_id = $/userId/
    and category = 'QUEST_REWARD'
    and ${PAID_FOR_PERIOD_SQL}`,
    { userId, periodStart },
    (row) => row.quest_type as QuestType
  )

// Pays the quest's bonus once per period. Returns null if it already paid out
// for the period starting at periodStart, and no txn if the tier multiplier
// makes the bonus zero.
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
      where to_id = $/userId/
      and category = 'QUEST_REWARD'
      and data->'data'->>'questType' = $/questType/
      and ${PAID_FOR_PERIOD_SQL}
      limit 1`,
      { userId: user.id, questType, periodStart }
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
      periodStart,
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
