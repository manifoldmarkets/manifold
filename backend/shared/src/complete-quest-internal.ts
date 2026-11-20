import { User } from 'common/user'
import { Contract } from 'common/contract'
import {
  getNextQuestWeekStart,
  getQuestWeekStart,
  MARKET_CREATION_QUESTS,
  QUEST_DETAILS,
  QuestType,
  toNotificationQuestType,
} from 'common/quest'
import { QuestRewardTxn } from 'common/txn'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { createQuestPayoutNotification } from 'shared/create-notification'
import { setQuestScoreValue } from 'common/supabase/set-scores'
import { millisToTs } from 'common/supabase/utils'
import { pacificStartOfDayMs } from 'common/streak-snapshot'
import { HOUR_MS } from 'common/util/time'
import { log } from 'shared/utils'
import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
} from 'common/supporter-config'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'

// Pays the daily sharing quest once the user has shared a question today. Safe
// to call any number of times, from any request: it pays whenever today's share
// count has reached the target and nothing has been paid for today yet, so the
// next share (or the next call for the same share) makes good a call that
// failed, never arrived, or ran alongside another one.
//
// It used to pay only when a call saw the count step from 0 to exactly 1, and
// wrote the new count first. A double tap (both calls count 2), a lost first
// request, or a failed payout skipped that step, so the reward was lost for the
// rest of the day while the quests modal showed the quest as done.
export const completeSharingQuest = async (user: User) => {
  const questType = 'SHARES'
  const { scoreId, requiredCount } = QUEST_DETAILS[questType]
  const period = getPacificDayPeriod()
  // Only the period's own shares: a call that took yesterday's period just
  // before midnight mustn't count a share made after it, or one share would
  // pay both yesterday's reward and today's.
  const count = await getUserShareEventsCount(
    user.id,
    millisToTs(period.periodStart),
    millisToTs(period.periodEnd)
  )
  // The score shows today's progress in the quests modal. A call that took
  // yesterday's period and counted after midnight mustn't overwrite today's.
  if (getPacificDayPeriod().periodStart === period.periodStart)
    await setQuestScoreValue(user.id, scoreId, count, createSupabaseClient())
  log('completing quest', { questType, userId: user.id, count, ...period })
  if (count < requiredCount) return { count }

  // Unlocked pre-check, so users who share many questions a day don't take the
  // user row lock on every share. awardQuestBonus re-checks under the lock.
  const pg = createSupabaseDirectClient()
  const paid = await getQuestTypesPaidForPeriod(pg, user.id, period)
  if (paid.includes(questType)) return { count }

  const resp = await awardQuestBonus(user, questType, period)
  // Another call paid it first.
  if (!resp) return { count }
  if (!resp.txn) {
    log(`Quest bonus rounded to zero for user ${user.id} (${questType})`)
    return { count }
  }
  // The reward is already paid, so a failed notification mustn't fail the call.
  await notifyQuestPayout(user, questType, resp.txn.id, resp.bonusAmount)
  return { count, txn: resp.txn, bonusAmount: resp.bonusAmount }
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
  const paid = await getQuestTypesPaidForPeriod(
    pg,
    userId,
    weekPeriod(weekStart)
  )
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
    const resp = await awardQuestBonus(user, questType, weekPeriod(weekStart))
    if (!resp) continue
    if (!resp.txn) {
      log(`Quest bonus rounded to zero for user ${user.id} (${questType})`)
      continue
    }
    // The reward is already paid, so a failed notification mustn't stop the
    // next quest's payout.
    await notifyQuestPayout(user, questType, resp.txn.id, resp.bonusAmount)
  }
}

const notifyQuestPayout = async (
  user: User,
  questType: QuestType,
  txnId: string,
  bonusAmount: number
) =>
  await createQuestPayoutNotification(
    user,
    txnId,
    bonusAmount,
    QUEST_DETAILS[questType].requiredCount,
    toNotificationQuestType(questType)
  ).catch((e) =>
    log.error('Failed to create quest payout notification', {
      userId: user.id,
      questType,
      error: e instanceof Error ? e.message : String(e),
    })
  )

// The day or week a quest reward pays for, as epoch ms [start, end).
type QuestPeriod = { periodStart: number; periodEnd: number }

// The Pacific calendar day containing `now`: 23 or 25 hours long on the DST
// changes. 36 hours past its start is always inside the next day.
const getPacificDayPeriod = (now: Date = new Date()): QuestPeriod => {
  const periodStart = pacificStartOfDayMs(now)
  return {
    periodStart,
    periodEnd: pacificStartOfDayMs(new Date(periodStart + 36 * HOUR_MS)),
  }
}

const weekPeriod = (weekStart: number): QuestPeriod => ({
  periodStart: weekStart,
  periodEnd: getNextQuestWeekStart(weekStart),
})

// A reward paid for the period: it records that periodStart, or, if paid
// before rewards recorded one, was paid within the period. A reward for an
// earlier period paid late (just past the boundary) records its own period,
// so it doesn't block this one.
//
// A reward without periodStart is placed by created_time, the start of the
// transaction that paid it. While API instances on older code still run (a
// rolling deploy), an older instance can pay a period just after it ended, and
// this code can't tell that reward from the next period's and may pay the
// period again. So the whole rollout, until no instance on older code is
// still serving requests, must stay outside 23:50 to 00:10 Pacific, and for
// the weekly creation quests, away from Monday 00:00 Pacific.
const PAID_FOR_PERIOD_SQL = `
  created_time >= millis_to_ts($/periodStart/)
  and (
    (data->'data'->>'periodStart')::bigint = $/periodStart/
    or (
      data->'data'->>'periodStart' is null
      and created_time < millis_to_ts($/periodEnd/)
    )
  )`

const getQuestTypesPaidForPeriod = async (
  pg: SupabaseDirectClient | SupabaseTransaction,
  userId: string,
  period: QuestPeriod
) =>
  await pg.map(
    `select distinct data->'data'->>'questType' as quest_type from txns
    where to_id = $/userId/
    and category = 'QUEST_REWARD'
    and ${PAID_FOR_PERIOD_SQL}`,
    { userId, ...period },
    (row) => row.quest_type as QuestType
  )

// Pays the quest's reward once per period. Returns null if it already paid out
// for the period, and no txn if the tier multiplier makes the reward zero.
//
// Takes only the user row, waiting for it with nothing else held, and pays
// outside the bets queue, so it can't deadlock with other payments:
// - It must not wait for the user's queue slot while holding the row. A bet of
//   the user's can hold that slot while waiting for the row. (Until 2026-11,
//   runTxnFromBank queued inside this transaction, and the queue's 10 second
//   expiry then failed the payout with a 503.)
// - It must not wait for the row while holding the slot. Cash conversion and
//   in-app purchases hold the row between two queued txns.
// A bet that read this user's row before the payout committed may retry on a
// serialization error, as it already would for a payout from another API
// process.
const awardQuestBonus = async (
  user: User,
  questType: QuestType,
  period: QuestPeriod
) => {
  const pg = createSupabaseDirectClient()
  return await pg.tx(async (tx) => {
    // Lock the user row to serialize concurrent quest reward grants for this
    // user, including across API instances. Without it, two concurrent calls
    // (or two questions created at once) can both pass the check below and
    // both pay.
    await tx.oneOrNone(`select 1 from users where id = $1 for no key update`, [
      user.id,
    ])
    const paid = await getQuestTypesPaidForPeriod(tx, user.id, period)
    if (paid.includes(questType)) return null

    // Fetch user's supporter entitlements for bonus multiplier
    const entitlements = await getActiveSupporterEntitlements(tx, user.id)

    // Resolve effective tier (account standing + subscription) and apply
    // its multiplier.
    const effectiveTier = resolveEffectiveTier({
      entitlements,
      bonusEligibility: user.bonusEligibility,
    })
    const questMultiplier = getEffectiveBonusMultiplier(effectiveTier, 'quest')
    const { rewardAmount: baseReward, requiredCount } = QUEST_DETAILS[questType]
    const rewardAmount = roundTierBonus(baseReward * questMultiplier)
    // runTxn rejects non-positive amounts (flagged accounts earn 0x).
    if (!(rewardAmount > 0)) return { txn: undefined, bonusAmount: 0 }

    const bonusTxnData = {
      questType,
      // The quest's required count, not the count seen, as every reward before
      // periodStart did: API instances still on older code during a deploy
      // only treat a SHARES or MARKETS_CREATED reward with questCount 1 as
      // already paid.
      questCount: requiredCount,
      periodStart: period.periodStart,
      effectiveTier,
      questMultiplier,
      supporterBonus: questMultiplier > 1,
    }

    const bonusTxn: Omit<QuestRewardTxn, 'id' | 'createdTime'> = {
      fromId: 'BANK',
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: rewardAmount,
      token: 'M$',
      category: 'QUEST_REWARD',
      data: bonusTxnData,
    }
    // Locking is done above, so don't queue.
    const txn = await runTxnOutsideBetQueue(tx, bonusTxn)
    return { txn, bonusAmount: rewardAmount }
  })
}

export async function getUserShareEventsCount(
  userId: string,
  startTs: string,
  endTs: string
) {
  const pg = createSupabaseDirectClient()
  const res = await pg.one(
    `select count(*)::int from user_contract_interactions
                where user_id = $1 and name = 'page share'
                  and created_time >= $2
                  and created_time < $3`,
    [userId, startTs, endTs]
  )
  return res.count
}
