import { APIError, authEndpoint, validate } from 'api/helpers'
import { getUser, isProd } from 'shared/utils'

import { z } from 'zod'
import { getRecentContractsCount } from 'common/supabase/contracts'
import { createSupabaseClient } from 'shared/supabase/init'
import * as admin from 'firebase-admin'
import { User } from 'common/user'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { runTxn } from 'shared/run-txn'
import { QuestRewardTxn } from 'common/txn'
import { QUEST_DETAILS, QUEST_TYPES, QuestType } from 'common/quest'
import { getUniqueUserShareEventsCount } from 'common/supabase/user-events'
import { createQuestPayoutNotification } from 'shared/create-notification'

const firestore = admin.firestore()
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
// configure dayjs as pacific time
dayjs.tz.setDefault('America/Los_Angeles')
// the start of the week is 12am on Monday Pacific time
const START_OF_WEEK = dayjs().startOf('week').add(1, 'day').valueOf()

const bodySchema = z.object({
  // must be of type QuestType
  questType: z.enum(QUEST_TYPES),
})

export const completequest = authEndpoint(async (req, auth) => {
  const { questType } = validate(bodySchema, req.body)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(400, 'User not found')

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

  // We already handle betting streak rewards in the onCreateBet trigger
  if (questType === 'BETTING_STREAK')
    return { count: user.currentBettingStreak }

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
})

const awardQuestBonus = async (
  user: User,
  questType: QuestType,
  newCount: number
) => {
  return await firestore.runTransaction(async (trans) => {
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
