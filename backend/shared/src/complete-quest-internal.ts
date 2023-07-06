import * as admin from 'firebase-admin'
const firestore = admin.firestore()
import { User } from 'common/user'
import { QUEST_DETAILS, QuestType } from 'common/quest'
import { getValues, isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { QuestRewardTxn } from 'common/txn'
import { runTxn } from 'shared/txn/run-txn'
import { createSupabaseClient } from 'shared/supabase/init'
import { getRecentContractsCount } from 'common/supabase/contracts'
import { getUniqueUserShareEventsCount } from 'common/supabase/user-events'
import { APIError } from 'common/api'
import { createQuestPayoutNotification } from 'shared/create-notification'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { getQuestScore, setQuestScoreValue } from 'common/supabase/set-scores'
import { SupabaseClient } from 'common/supabase/utils'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { sortBy } from 'lodash'
import { getReferralCount } from 'common/supabase/referrals'

dayjs.extend(utc)
dayjs.extend(timezone)
// configure dayjs as pacific time
dayjs.tz.setDefault('America/Los_Angeles')
// the start of the week is 12am on Monday Pacific time
export const START_OF_WEEK = dayjs().startOf('week').add(1, 'day').valueOf()
const START_OF_DAY = dayjs().startOf('day').valueOf()

type QUESTS_INTERNALLY_CALCULATED = 'MARKETS_CREATED' | 'SHARES' | 'REFERRALS'
export const completeCalculatedQuest = async (
  user: User,
  questType: 'SHARES'
) => {
  const db = createSupabaseClient()
  const count = await getCurrentCountForQuest(user, questType, db)
  const oldEntry = await getQuestScore(user.id, questType, db)
  return await completeQuestInternal(user, questType, oldEntry.score, count)
}

export const completeCalculatedQuestFromTrigger = async (
  user: User,
  questType: 'MARKETS_CREATED',
  // idempotencyKey is used to prevent duplicate quest completions from triggers firing multiple times
  idempotencyKey: string
) => {
  const db = createSupabaseClient()
  const count = await getCurrentCountForQuest(user, questType, db)
  const oldEntry = await getQuestScore(user.id, questType, db)
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

export const completeReferralsQuest = async (user: User) => {
  // Bc we don't issue a payout here, (onCreateBet does that) we don't need an idempotency key
  const db = createSupabaseClient()
  const questDetails = QUEST_DETAILS['REFERRALS']
  const count = await getCurrentCountForQuest(user, 'REFERRALS', db)
  await setQuestScoreValue(user.id, questDetails.scoreId, count, db)
}

export const completeArchaeologyQuest = async (
  mostRecentBet: Bet,
  user: User,
  contract: Contract,
  idempotencyKey: string
) => {
  if (mostRecentBet.isRedemption) return
  const bets = await getValues<Bet>(
    firestore.collection('contracts').doc(contract.id).collection('bets')
  )
  if (bets.length === 0) return
  const sortedEarlierBets = sortBy(
    bets.filter(
      (b) => !b.isRedemption && b.createdTime < mostRecentBet.createdTime
    ),
    (bet) => -bet.createdTime
  )
  const lastBetTime =
    sortedEarlierBets.length < 1
      ? contract.createdTime
      : sortedEarlierBets[0].createdTime
  const threeMonthsAgo = dayjs().subtract(3, 'month').valueOf()
  if (lastBetTime <= threeMonthsAgo) {
    const db = createSupabaseClient()
    const oldEntry = await getQuestScore(user.id, 'ARCHAEOLOGIST', db)
    if (oldEntry.idempotencyKey === idempotencyKey) return
    await completeQuestInternal(
      user,
      'ARCHAEOLOGIST',
      oldEntry.score,
      oldEntry.score + 1,
      idempotencyKey
    )
  }
}

const completeQuestInternal = async (
  user: User,
  questType: QuestType,
  oldScore: number,
  count: number,
  idempotencyKey?: string
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
  // If they have created the required amounts, send them a quest txn reward
  if (count !== oldScore && count === QUEST_DETAILS[questType].requiredCount) {
    const resp = await awardQuestBonus(user, questType, count)
    if (!resp.txn)
      throw new APIError(400, resp.message ?? 'Could not award quest bonus')
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
  user: User,
  questType: QUESTS_INTERNALLY_CALCULATED,
  db: SupabaseClient
): Promise<number> => {
  if (questType === 'MARKETS_CREATED') {
    return await getRecentContractsCount(user.id, START_OF_WEEK, db)
  } else if (questType === 'SHARES') {
    return await getUniqueUserShareEventsCount(
      user.id,
      START_OF_DAY,
      Date.now(),
      db
    )
  } else if (questType === 'REFERRALS') {
    return await getReferralCount(user.id, START_OF_WEEK, db)
  } else return 0
}

const awardQuestBonus = async (
  user: User,
  questType: QuestType,
  newCount: number
) => {
  return await firestore.runTransaction(async (trans) => {
    // make sure we don't already have a txn for this user/questType
    const previousTxns = firestore
      .collection('txns')
      .where('toId', '==', user.id)
      .where('category', '==', 'QUEST_REWARD')
      .where('data.questType', '==', questType)
      .where('data.questCount', '==', newCount)
      .where('createdTime', '>=', START_OF_DAY)
      .limit(1)
    const previousTxn = (await trans.get(previousTxns)).docs[0]
    if (previousTxn) {
      return {
        error: true,
        message: 'Already awarded quest bonus',
      }
    }
    const fromUserId = isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

    const rewardAmount = QUEST_DETAILS[questType].rewardAmount

    const bonusTxnData = {
      questType,
      questCount: newCount,
    }

    const bonusTxn = {
      fromId: fromUserId,
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: rewardAmount,
      token: 'M$',
      category: 'QUEST_REWARD',
      data: bonusTxnData,
    } as Omit<QuestRewardTxn, 'id' | 'createdTime'>

    const { message, txn, status } = await runTxn(trans, bonusTxn)
    return { message, txn, status, bonusAmount: rewardAmount }
  })
}
