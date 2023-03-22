import * as admin from 'firebase-admin'
const firestore = admin.firestore()
import { User } from 'common/user'
import { QUEST_DETAILS, QuestType } from 'common/quest'
import { isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { QuestRewardTxn } from 'common/txn'
import { runTxn } from 'shared/run-txn'
import { createSupabaseClient } from 'shared/supabase/init'
import { getRecentContractsCount } from 'common/supabase/contracts'
import { getUniqueUserShareEventsCount } from 'common/supabase/user-events'
import { APIError } from 'common/api'
import { createQuestPayoutNotification } from 'shared/create-notification'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
// configure dayjs as pacific time
dayjs.tz.setDefault('America/Los_Angeles')
// the start of the week is 12am on Monday Pacific time
const START_OF_WEEK = dayjs().startOf('week').add(1, 'day').valueOf()
export const completeQuestInternal = async (
  user: User,
  questType: QuestType
) => {
  // We already handle betting streak rewards in the onCreateBet trigger
  if (questType === 'BETTING_STREAK')
    return { count: user.currentBettingStreak }

  const questDetails = QUEST_DETAILS[questType]
  const currentCount = user[questDetails.userKey] ?? 0
  if (currentCount > questDetails.requiredCount) {
    return { message: 'Quest already completed' }
  }
  const db = createSupabaseClient()
  let count = 0

  if (questType === 'MARKETS_CREATED') {
    count = await getRecentContractsCount(user.id, START_OF_WEEK, db)
    if (user.marketsCreatedThisWeek !== count)
      await firestore
        .collection('users')
        .doc(user.id)
        .update({
          marketsCreatedThisWeek: count,
        } as Partial<User>)
  } else if (questType === 'SHARES') {
    count = await getUniqueUserShareEventsCount(
      user.id,
      START_OF_WEEK,
      Date.now(),
      db
    )
    await firestore
      .collection('users')
      .doc(user.id)
      .update({
        sharesThisWeek: count,
      } as Partial<User>)
  }

  // If they have created the required amounts, send them a quest txn reward
  if (count === QUEST_DETAILS[questType].requiredCount) {
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
      .where('createdTime', '>=', dayjs().subtract(1, 'day').valueOf())
      .limit(1)
    const previousTxn = (await previousTxns.get()).docs[0]
    if (previousTxn) {
      const data = previousTxn.data() as QuestRewardTxn
      return {
        message: 'Already awarded quest bonus',
        txn: data,
        status: 'SUCCESS',
        bonusAmount: data.amount,
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
