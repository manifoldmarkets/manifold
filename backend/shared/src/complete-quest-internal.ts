import { User } from 'common/user'
import { QUEST_DETAILS, QuestType } from 'common/quest'
import { QuestRewardTxn } from 'common/txn'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { getRecentContractIds } from 'common/supabase/contracts'
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

const getPacificStartOfDay = () =>
  dayjs().tz('America/Los_Angeles').startOf('day').valueOf()

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
  const startOfDay = getPacificStartOfDay()
  const count = await getUserShareEventsCount(user.id, millisToTs(startOfDay))
  await setQuestScoreValue(user.id, scoreId, count, createSupabaseClient())
  log('completing quest', { questType, userId: user.id, count, startOfDay })
  if (count < requiredCount) return { count }

  // Unlocked pre-check, so users who share many questions a day don't queue a
  // payout attempt on every share. awardQuestBonus re-checks under the lock.
  const pg = createSupabaseDirectClient()
  if (await wasQuestRewardPaidSince(pg, user.id, questType, startOfDay))
    return { count }

  // Record the quest's required count, not the shares seen, as every reward
  // before this change did: API instances still running the old code during a
  // deploy only treat a reward with questCount 1 as already paid.
  const resp = await awardQuestBonus(user, questType, requiredCount, startOfDay)
  // Another call paid it first.
  if (!resp) return { count }
  if (!resp.txn) {
    log(`Quest bonus rounded to zero for user ${user.id} (${questType})`)
    return { count }
  }
  // The reward is already paid, so a failed notification mustn't fail the call.
  await createQuestPayoutNotification(
    user,
    resp.txn.id,
    resp.bonusAmount,
    requiredCount,
    questType
  ).catch((e) =>
    log.error('Failed to create quest payout notification', {
      userId: user.id,
      questType,
      error: e instanceof Error ? e.message : String(e),
    })
  )
  return { count, txn: resp.txn, bonusAmount: resp.bonusAmount }
}

export const completeCalculatedQuestFromTrigger = async (
  user: User,
  questType: 'MARKETS_CREATED',
  // idempotencyKey is used to prevent duplicate quest completions from triggers firing multiple times
  idempotencyKey: string,
  contractId: string
) => {
  const db = createSupabaseClient()
  const startOfWeek = dayjs()
    .tz('America/Los_Angeles')
    .startOf('week')
    .add(1, 'day')
    .valueOf()
  const contractIds = await getRecentContractIds(user.id, startOfWeek, db)
  // In case replication hasn't happened yet, add the id manually
  if (!contractIds.includes(contractId)) contractIds.push(contractId)
  const count = contractIds.length
  log(
    'markets created this week count:',
    count,
    'for user:',
    user.id,
    'and idempotencyKey:',
    idempotencyKey
  )
  const oldEntry = await getQuestScore(user.id, questType, db)
  log('current quest entry:', oldEntry, 'for user:', user.id)
  if (idempotencyKey && oldEntry.idempotencyKey === idempotencyKey)
    return { count: oldEntry.score }
  return await completeQuestInternal(
    user,
    questType,
    oldEntry.score,
    count,
    idempotencyKey
  )
}

const completeQuestInternal = async (
  user: User,
  questType: 'MARKETS_CREATED',
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
  const startOfDay = getPacificStartOfDay()
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

// Whether the user was paid this quest's reward at or after periodStart.
const wasQuestRewardPaidSince = async (
  pg: SupabaseDirectClient | SupabaseTransaction,
  userId: string,
  questType: QuestType,
  periodStart: number
) =>
  !!(await pg.oneOrNone(
    `select 1 from txns
    where to_id = $1
    and category = 'QUEST_REWARD'
    and data->'data'->>'questType' = $2
    and created_time >= millis_to_ts($3)
    limit 1`,
    [userId, questType, periodStart]
  ))

class QuestPayoutUserBusy extends Error {}

const QUEST_PAYOUT_MAX_ATTEMPTS = 4

// Locks the user row to serialize concurrent quest reward grants for this
// user, including across API instances (the bets queue is per process).
// Without it, two concurrent calls can both pass the paid check and both pay.
// NOWAIT, because this runs inside the user's bets queue slot: some payments
// (cash conversion, in-app purchases) hold this row between two queued txns,
// so waiting for it here would leave their second txn waiting for our slot.
const lockQuestUser = async (tx: SupabaseTransaction, userId: string) => {
  try {
    await tx.oneOrNone(
      `select 1 from users where id = $1 for no key update nowait`,
      [userId]
    )
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '55P03'
    )
      throw new QuestPayoutUserBusy()
    throw error
  }
}

// Pays the quest's reward unless one was already paid since periodStart.
// Returns null if it was, and no txn if the tier multiplier makes it zero.
const awardQuestBonus = async (
  user: User,
  questType: QuestType,
  questCount: number,
  periodStart: number
) => {
  const pg = createSupabaseDirectClient()
  for (let attempt = 0; ; attempt++) {
    try {
      return await payQuestBonusOnce(
        pg,
        user,
        questType,
        questCount,
        periodStart
      )
    } catch (error) {
      // Only the NOWAIT lock is retried: it fails before any write.
      if (!(error instanceof QuestPayoutUserBusy)) throw error
      if (attempt + 1 === QUEST_PAYOUT_MAX_ATTEMPTS)
        throw new APIError(503, 'Your account is busy. Please try again.')
      // The transaction and the queue slot have both been released. Give the
      // payment holding the row time to finish, with jitter. Three waits total
      // 0.7 to 1.4 seconds.
      const delayMs = 100 * 2 ** attempt * (1 + Math.random())
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

const payQuestBonusOnce = async (
  pg: SupabaseDirectClient,
  user: User,
  questType: QuestType,
  questCount: number,
  periodStart: number
) =>
  // Take the user's bets queue slot before locking their row, the same order
  // as bets, sales and loans. Locking the row first and then waiting for the
  // slot (as runTxnFromBank inside the transaction did) deadlocks with a bet of
  // the user's that already holds the slot and is waiting for the row, until
  // the queue's 10 second expiry fails the payout with a 503.
  await betsQueue.enqueueFn(
    () =>
      pg.tx(async (tx) => {
        await lockQuestUser(tx, user.id)
        if (await wasQuestRewardPaidSince(tx, user.id, questType, periodStart))
          return null

        // Fetch user's supporter entitlements for bonus multiplier
        const entitlements = await getActiveSupporterEntitlements(tx, user.id)

        // Resolve effective tier (account standing + subscription) and apply
        // its multiplier.
        const effectiveTier = resolveEffectiveTier({
          entitlements,
          bonusEligibility: user.bonusEligibility,
        })
        const questMultiplier = getEffectiveBonusMultiplier(
          effectiveTier,
          'quest'
        )
        const baseReward = QUEST_DETAILS[questType].rewardAmount
        const rewardAmount = roundTierBonus(baseReward * questMultiplier)
        // runTxn rejects non-positive amounts (flagged accounts earn 0x).
        if (!(rewardAmount > 0)) return { txn: undefined, bonusAmount: 0 }

        const bonusTxnData = {
          questType,
          questCount,
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
        // Already inside this user's queue slot, so don't queue again.
        const txn = await runTxnOutsideBetQueue(tx, bonusTxn)
        return { txn, bonusAmount: rewardAmount }
      }),
    [user.id]
  )

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
