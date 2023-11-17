import * as admin from 'firebase-admin'
const firestore = admin.firestore()
import { User } from 'common/user'
import { QUEST_DETAILS, QuestType } from 'common/quest'

import { QuestRewardTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { createSupabaseClient } from 'shared/supabase/init'
import { getRecentContractIds } from 'common/supabase/contracts'
import { getUserShareEventsCount } from 'common/supabase/user-events'
import { APIError } from 'common/api'
import { createQuestPayoutNotification } from 'shared/create-notification'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { getQuestScore, setQuestScoreValue } from 'common/supabase/set-scores'
import { millisToTs, SupabaseClient } from 'common/supabase/utils'
import { getReferralCount } from 'common/supabase/referrals'
import { GCPLog, log as oldLog } from 'shared/utils'
dayjs.extend(utc)
dayjs.extend(timezone)

export const completeSharingQuest = async (user: User, log: GCPLog) => {
  const db = createSupabaseClient()
  const count = await getCurrentCountForQuest(user.id, 'SHARES', db)
  const oldEntry = await getQuestScore(user.id, 'SHARES', db)
  return await completeQuestInternal(
    user,
    'SHARES',
    oldEntry.score,
    count,
    undefined,
    log
  )
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
  oldLog(
    'markets created this week count:',
    count,
    'for user:',
    user.id,
    'and idempotencyKey:',
    idempotencyKey
  )
  const oldEntry = await getQuestScore(user.id, questType, db)
  oldLog('current quest entry:', oldEntry, 'for user:', user.id)
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

export const completeReferralsQuest = async (userId: string) => {
  // Bc we don't issue a payout here, (onCreateBet does that) we don't need an idempotency key
  const db = createSupabaseClient()
  const questDetails = QUEST_DETAILS['REFERRALS']
  const count = await getCurrentCountForQuest(userId, 'REFERRALS', db)
  await setQuestScoreValue(userId, questDetails.scoreId, count, db)
}

const completeQuestInternal = async (
  user: User,
  questType: QuestType,
  oldScore: number,
  count: number,
  idempotencyKey: string | undefined,
  log: GCPLog = oldLog
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
  // If they have created the required amounts, send them a quest txn reward
  if (count !== oldScore && count === QUEST_DETAILS[questType].requiredCount) {
    const resp = await awardQuestBonus(user, questType, count)
    if (!resp.txn)
      throw new APIError(500, resp.message ?? 'Could not award quest bonus')
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
  questType: 'SHARES' | 'REFERRALS',
  db: SupabaseClient
): Promise<number> => {
  if (questType === 'SHARES') {
    const startOfDay = dayjs()
      .tz('America/Los_Angeles')
      .startOf('day')
      .valueOf()
    const startTs = millisToTs(startOfDay)
    oldLog('getting shares count for user', userId, 'from startTs', startTs)
    return await getUserShareEventsCount(userId, startTs, db)
  } else if (questType === 'REFERRALS') {
    const startOfWeek = dayjs()
      .tz('America/Los_Angeles')
      .startOf('week')
      .add(1, 'day')
      .valueOf()
    return await getReferralCount(userId, startOfWeek, db)
  } else return 0
}

const awardQuestBonus = async (
  user: User,
  questType: QuestType,
  newCount: number
) => {
  const startOfDay = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()
  return await firestore.runTransaction(async (trans) => {
    // make sure we don't already have a txn for this user/questType
    const previousTxns = firestore
      .collection('txns')
      .where('toId', '==', user.id)
      .where('category', '==', 'QUEST_REWARD')
      .where('data.questType', '==', questType)
      .where('data.questCount', '==', newCount)
      .where('createdTime', '>=', startOfDay)
      .limit(1)
    const previousTxn = (await trans.get(previousTxns)).docs[0]
    if (previousTxn) {
      return {
        error: true,
        message: 'Already awarded quest bonus',
      }
    }
    const rewardAmount = QUEST_DETAILS[questType].rewardAmount

    const bonusTxnData = {
      questType,
      questCount: newCount,
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
    const { message, txn, status } = await runTxnFromBank(trans, bonusTxn)
    return { message, txn, status, bonusAmount: rewardAmount }
  })
}
