import { Answer } from 'common/answer'
import { Bet, LimitBet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract, MarketContract, PollContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { LeagueChangeNotificationData } from 'common/leagues'
import {
  BetFillData,
  BetReplyNotificationData,
  BettingStreakData,
  ContractResolutionData,
  LeagueChangeData,
  MarketMovementData,
  Notification,
  notification_reason_types,
  NotificationReason,
  PaymentCompletedData,
  ReviewNotificationData,
  UniqueBettorData,
} from 'common/notification'
import { answerToMidpoint, getRangeContainingValues } from 'common/number'
import { QuestType } from 'common/quest'
import { convertBet } from 'common/supabase/bets'
import { convertPrivateUser, convertUser } from 'common/supabase/users'
import { QuestRewardTxn, UniqueBettorBonusTxn } from 'common/txn'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
  User,
} from 'common/user'
import {
  getNotificationDestinationsForUser,
  notification_preference,
  userIsBlocked,
  userOptedOutOfBrowserNotifications,
} from 'common/user-notification-preferences'
import { formatMoney } from 'common/util/format'
import { floatingEqual } from 'common/util/math'
import { removeUndefinedProps } from 'common/util/object'
import { richTextToString } from 'common/util/parse'
import { mapAsync } from 'common/util/promise'
import { nanoid } from 'common/util/random'
import {
  forEach,
  groupBy,
  keyBy,
  last,
  mapValues,
  minBy,
  orderBy,
  sum,
  sumBy,
  uniq,
} from 'lodash'
import { hasUserSeenMarket } from 'shared/helpers/seen-markets'
import {
  getUniqueBettorIds,
  getUniqueBettorIdsForAnswer,
} from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import {
  bulkInsertNotifications,
  insertNotificationToSupabase,
} from 'shared/supabase/notifications'
import { getPrivateUser, getUser, log } from 'shared/utils'
import { createPushNotifications } from './create-push-notifications'
import {
  EmailAndTemplateEntry,
  formatMoneyEmail,
  getMarketResolutionEmail,
  sendBulkEmails,
  sendMarketCloseEmail,
  sendNewUniqueBettorsEmail,
  toDisplayResolution,
} from './emails'

export * from './notifications/create-follow-or-market-subsidized-notification'
export * from './notifications/create-new-answer-on-contract-notification'

export type replied_users_info = {
  [key: string]: {
    repliedToType: 'comment' | 'answer'
    repliedToAnswerText: string | undefined
    repliedToAnswerId: string | undefined
    bet: Bet | undefined
  }
}

export const createBetFillNotification = async (
  toUser: User,
  fromUser: User,
  bet: Bet,
  limitBet: LimitBet,
  contract: Contract
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'bet_fill'
  )
  if (!sendToBrowser && !sendToMobile) return

  // The limit order fills array has a matchedBetId that does not match this bet id
  // (even though this bet has a fills array that is matched to the limit order)
  // This is likely bc this bet is an arbitrage bet. This should be fixed.
  // This matches based on timestamp because of the above bug.
  const fill =
    limitBet.fills.find((fill) => fill.timestamp === bet.createdTime) ??
    last(orderBy(limitBet.fills, 'timestamp', 'asc'))
  // const fill = limitBet.fills.find((f) => f.matchedBetId === bet.id)

  const fillAmount = fill?.amount ?? 0
  const remainingAmount =
    limitBet.orderAmount - sum(limitBet.fills.map((f) => f.amount))
  const limitAt =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? limitBet.limitProb * (contract.max - contract.min) + contract.min
      : Math.round(limitBet.limitProb * 100) + '%'
  const betAnswer =
    'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id === bet.answerId)?.text
      : undefined

  if (fillAmount < 1) {
    return
  }

  const notification: Notification = {
    id: nanoid(6),
    userId: toUser.id,
    reason: 'bet_fill',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: limitBet.id,
    sourceType: 'bet',
    sourceUpdateType: 'updated',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: fillAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    data: {
      betAnswer,
      creatorOutcome: limitBet.outcome,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
      limitAt: limitAt.toString(),
      outcomeType: contract.outcomeType,
      mechanism: contract.mechanism,
    } as BetFillData,
  }
  if (sendToBrowser) {
    const pg = createSupabaseDirectClient()
    await insertNotificationToSupabase(notification, pg)
  }
  if (sendToMobile) {
    await createPushNotifications([
      [
        privateUser,
        notification,
        `Fill on ${limitBet.outcome} order at ${limitAt}: ${contract.question}`,
        `${formatMoneyEmail(fillAmount)} filled by ${fromUser.name}: ${
          floatingEqual(remainingAmount, 0)
            ? 'Order complete.'
            : `${formatMoneyEmail(remainingAmount)} remaining.`
        }`,
      ],
    ])
  }
}

export const createLimitBetCanceledNotification = async (
  fromUser: User,
  toUserId: string,
  limitBet: LimitBet,
  fillAmount: number,
  contract: Contract
) => {
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'bet_fill'
  )
  if (!sendToBrowser) return

  const remainingAmount =
    limitBet.orderAmount -
    (sum(limitBet.fills.map((f) => f.amount)) + fillAmount)
  const limitAt =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? limitBet.limitProb * (contract.max - contract.min) + contract.min
      : Math.round(limitBet.limitProb * 100) + '%'

  const betAnswer =
    'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id === limitBet.answerId)
      : undefined

  const notification: Notification = {
    id: nanoid(6),
    userId: toUserId,
    reason: 'limit_order_cancelled',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: limitBet.id,
    sourceType: 'bet',
    sourceUpdateType: 'updated',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: remainingAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    data: {
      creatorOutcome: limitBet.outcome,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
      limitAt: limitAt.toString(),
      outcomeType: contract.outcomeType,
      mechanism: contract.mechanism,
      betAnswer: betAnswer?.text,
      betAnswerId: limitBet.answerId,
      expiresAt: limitBet.expiresAt,
      createdTime: limitBet.createdTime,
    } as BetFillData,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createLimitBetExpiredNotification = async (
  limitBet: LimitBet,
  contract: Contract
) => {
  const toUserId = limitBet.userId
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'bet_fill'
  )
  if (!sendToBrowser) return

  const remainingAmount =
    limitBet.orderAmount - sum(limitBet.fills.map((f) => f.amount))
  const limitAt =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? limitBet.limitProb * (contract.max - contract.min) + contract.min
      : Math.round(limitBet.limitProb * 100) + '%'
  const betAnswer =
    'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id === limitBet.answerId)
      : undefined

  const notification: Notification = {
    id: nanoid(6),
    userId: toUserId,
    reason: 'limit_order_cancelled',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: limitBet.id,
    sourceType: 'bet',
    sourceUpdateType: 'expired',
    sourceUserName: '',
    sourceUserUsername: '',
    sourceUserAvatarUrl: '',
    sourceText: remainingAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    data: {
      creatorOutcome: limitBet.outcome,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
      limitAt: limitAt.toString(),
      outcomeType: contract.outcomeType,
      betAnswer: betAnswer?.text,
      betAnswerId: limitBet.answerId,
      expiresAt: limitBet.expiresAt,
      createdTime: limitBet.createdTime,
      mechanism: contract.mechanism,
    } as BetFillData,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createReferralNotification = async (
  toUserId: string,
  referredUser: User,
  bonusAmount: string,
  referredByContract?: Contract
) => {
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'you_referred_user'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: referredUser.id + '-signup-referral-bonus',
    userId: toUserId,
    reason:
      referredByContract?.creatorId === toUserId
        ? 'user_joined_to_bet_on_your_market'
        : 'you_referred_user',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: referredUser.id,
    sourceType: 'user',
    sourceContractId: referredByContract?.id,

    sourceUpdateType: 'updated',
    sourceUserName: referredUser.name,
    sourceUserUsername: referredUser.username,
    sourceUserAvatarUrl: referredUser.avatarUrl,
    sourceText: bonusAmount,
    // Only pass the contract referral details if they weren't referred to a group
    sourceContractCreatorUsername: referredByContract?.creatorUsername,
    sourceContractTitle: referredByContract?.question,
    sourceContractSlug: referredByContract?.slug,
    sourceSlug: referredByContract?.slug,
    sourceTitle: referredByContract?.question,
    data: {
      manaAmount: parseFloat(bonusAmount),
      cashAmount: 0,
    },
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
  // TODO send email notification
}

export const createLoanIncomeNotification = async (
  toUser: User,
  income: number
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'loan_income'
  )
  if (!sendToBrowser) return
  const idempotencyKey = new Date().toDateString().replace(' ', '-')

  const notification: Notification = {
    id: idempotencyKey + '-loan-income-' + income,
    userId: toUser.id,
    reason: 'loan_income',
    createdTime: Date.now(),
    isSeen: true,
    sourceId: idempotencyKey,
    sourceType: 'loan',
    sourceUpdateType: 'updated',
    sourceUserName: toUser.name,
    sourceUserUsername: toUser.username,
    sourceUserAvatarUrl: toUser.avatarUrl,
    sourceText: income.toString(),
    sourceTitle: 'Loan',
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createManaPaymentNotification = async (
  fromUser: User,
  toUserId: string,
  amount: number,
  message: string | undefined,
  token: 'M$' | 'CASH'
) => {
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const optedOut = userOptedOutOfBrowserNotifications(privateUser)
  if (optedOut) return

  const notification: Notification = {
    id: nanoid(6),
    userId: toUserId,
    reason: 'mana_payment_received',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: fromUser.id,
    sourceType: 'mana_payment',
    sourceUpdateType: 'created',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: amount.toString(),
    data: {
      message: message ?? '',
      token,
    },
    sourceTitle: 'User payments',
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBettingStreakBonusNotification = async (
  user: User,
  txnId: string,
  bet: Bet,
  contract: Contract,
  amount: number,
  streak: number
) => {
  const privateUser = await getPrivateUser(user.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'betting_streaks'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: nanoid(6),
    userId: user.id,
    reason: 'betting_streaks',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'betting_streak_bonus',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: amount.toString(),
    sourceSlug: `/${contract.creatorUsername}/${contract.slug}/bets/${bet.id}`,
    sourceTitle: 'Betting Streak Bonus',
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractCreatorUsername: contract.creatorUsername,
    data: {
      streak: streak,
      bonusAmount: amount,
      cashAmount: 0,
    } as BettingStreakData,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBettingStreakExpiringNotification = async (
  idsAndStreaks: [string, number][],
  pg: SupabaseDirectClient
) => {
  const privateUsers = await pg.map(
    `select * from private_users where id = any($1)`,
    [idsAndStreaks.map(([id]) => id)],
    convertPrivateUser
  )
  const bulkPushNotifications: [PrivateUser, Notification, string, string][] =
    []
  const bulkNotifications: Notification[] = []
  forEach(idsAndStreaks, async ([userId, streak]) => {
    const privateUser = privateUsers.find((user) => user.id === userId)
    if (!privateUser) return
    const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
      privateUser,
      'betting_streaks'
    )
    const id = nanoid(6)
    const notification: Notification = {
      id,
      userId,
      reason: 'betting_streaks',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id,
      sourceText: streak.toString(),
      sourceType: 'betting_streak_expiring',
      sourceUpdateType: 'created',
      sourceUserName: '',
      sourceUserUsername: '',
      sourceUserAvatarUrl: '',
      sourceTitle: 'Betting Streak Expiring',
      data: {
        streak: streak,
      } as BettingStreakData,
    }
    if (sendToMobile) {
      bulkPushNotifications.push([
        privateUser,
        notification,
        `${streak} day streak expiring!`,
        'Place a prediction in the next 3 hours to keep it.',
      ])
    }
    if (sendToBrowser) {
      bulkNotifications.push(notification)
    }
  })
  await createPushNotifications(bulkPushNotifications)
  await bulkInsertNotifications(bulkNotifications, pg)
}

export const createLeagueChangedNotifications = async (
  pg: SupabaseDirectClient,
  data: LeagueChangeNotificationData[]
) => {
  if (data.length === 0) return

  log(`Creating ${data.length} league change notifications.`)

  const userIds = data.map((d) => d.userId)

  // Fetch all relevant private users in bulk
  const privateUsers = await pg.map(
    `select * from private_users where id = any($1)`,
    [userIds],
    convertPrivateUser
  )
  const privateUserMap = new Map(privateUsers.map((user) => [user.id, user]))

  const bulkNotifications: Notification[] = []

  for (const item of data) {
    const privateUser = privateUserMap.get(item.userId)
    if (!privateUser) {
      log(`Could not find private user ${item.userId}`)
      continue
    }

    // Check notification preferences
    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      'league_changed'
    )
    if (!sendToBrowser) continue

    // Construct notification data
    const id = nanoid(6) // Still need a unique ID per notification
    const notificationData: LeagueChangeData = {
      previousLeague: item.previousLeague,
      newLeague: item.newLeague,
      bonusAmount: item.bonusAmount,
    }

    const notification: Notification = {
      id,
      userId: item.userId,
      reason: 'league_changed',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id, // Use the generated id as sourceId for uniqueness? Or maybe season identifier? Let's use id for now.
      sourceText: item.bonusAmount.toString(),
      sourceType: 'league_change',
      sourceUpdateType: 'created',
      sourceUserName: '', // Not relevant for this type
      sourceUserUsername: '', // Not relevant for this type
      sourceUserAvatarUrl: '', // Not relevant for this type
      data: notificationData,
    }
    bulkNotifications.push(notification)
  }

  if (bulkNotifications.length > 0) {
    await bulkInsertNotifications(bulkNotifications, pg)
    log(`Inserted ${bulkNotifications.length} league change notifications.`)
  } else {
    log('No league change notifications met filter criteria.')
  }
}

export const createNewBettorNotification = async (
  // Creator of contract or answer that was bet on.
  creatorId: string,
  bettor: User,
  contract: Contract,
  bet: Bet,
  txn: UniqueBettorBonusTxn,
  bets: Bet[] | undefined
) => {
  const privateUser = await getPrivateUser(creatorId)
  if (!privateUser) return
  const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'unique_bettors_on_your_contract'
  )
  const pg = createSupabaseDirectClient()

  if (sendToBrowser) {
    const { outcomeType } = contract
    const pseudoNumericData =
      outcomeType === 'PSEUDO_NUMERIC'
        ? {
            min: contract.min,
            max: contract.max,
            isLogScale: contract.isLogScale,
          }
        : {}
    const allBetOnAnswerIds = (bets ?? []).map((b) => b.answerId)
    const range =
      outcomeType === 'NUMBER'
        ? getRangeContainingValues(
            contract.answers
              .filter((a) => allBetOnAnswerIds.includes(a.id))
              .map(answerToMidpoint),
            contract
          )
        : undefined

    const notification: Notification = {
      id: nanoid(6),
      userId: creatorId,
      reason: 'unique_bettors_on_your_contract',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: bet.id,
      sourceType: 'bonus',
      sourceUpdateType: 'created',
      sourceUserName: bettor.name,
      sourceUserUsername: bettor.username,
      sourceUserAvatarUrl: bettor.avatarUrl,
      sourceText: txn.amount.toString(),
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceContractId: contract.id,
      sourceContractTitle: contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      data: removeUndefinedProps({
        bet,
        answerText:
          outcomeType === 'MULTIPLE_CHOICE'
            ? contract.answers.find(
                (a) => a.id === bet.outcome || a.id === bet.answerId
              )?.text
            : outcomeType === 'NUMBER' && range
            ? `${range[0]}-${range[1]}`
            : undefined,
        outcomeType,
        ...pseudoNumericData,
        totalAmountBet: sumBy(bets, 'amount'),
        token: contract.token,
        bonusAmount: txn.amount,
      } as UniqueBettorData),
    }
    await insertNotificationToSupabase(notification, pg)
  }

  if (!sendToEmail || contract.uniqueBettorCount > 6) return
  const { answerId } = bet
  // For bets with answerId (multiple choice), give a bonus for the first bet on each answer.
  // NOTE: this may miscount unique bettors if they place multiple bets quickly b/c of replication delay.
  const uniqueBettorIds = answerId
    ? await getUniqueBettorIdsForAnswer(contract.id, answerId, pg)
    : await getUniqueBettorIds(contract.id, pg)
  if (!uniqueBettorIds.includes(bettor.id)) uniqueBettorIds.push(bettor.id)
  const uniqueBettorsExcludingCreator = uniqueBettorIds.filter(
    (id) => id !== contract.creatorId
  )
  const TOTAL_NEW_BETTORS_TO_REPORT = 5
  // Only send on 5th bettor
  if (uniqueBettorsExcludingCreator.length !== TOTAL_NEW_BETTORS_TO_REPORT)
    return

  const lastBettorIds = uniqueBettorsExcludingCreator.slice(
    uniqueBettorsExcludingCreator.length - TOTAL_NEW_BETTORS_TO_REPORT,
    uniqueBettorsExcludingCreator.length
  )

  const mostRecentUniqueBettors = await pg.map(
    `select * from users where id in ($1:list)`,
    [lastBettorIds],
    convertUser
  )

  const unseenBets = await pg.map<Bet>(
    `select * from contract_bets where contract_id = $1
            and user_id in ($2:list)`,
    [contract.id, lastBettorIds],
    convertBet
  )

  const bettorsToTheirBets = groupBy(unseenBets, (bet) => bet.userId)

  // Don't send if creator has seen their market since the 1st bet was placed
  const creatorHasSeenMarketSinceBet = await hasUserSeenMarket(
    contract.id,
    privateUser.id,
    minBy(unseenBets, 'createdTime')?.createdTime ?? contract.createdTime,
    pg
  )
  if (creatorHasSeenMarketSinceBet) return

  // TODO: add back bonus amount to email
  await sendNewUniqueBettorsEmail(
    'unique_bettors_on_your_contract',
    privateUser,
    contract,
    uniqueBettorsExcludingCreator.length,
    mostRecentUniqueBettors,
    bettorsToTheirBets,
    txn.amount * TOTAL_NEW_BETTORS_TO_REPORT
  )
}

export const createContractResolvedNotifications = async (
  contract: MarketContract,
  resolver: User,
  creator: User,
  outcome: string,
  probabilityInt: number | undefined,
  resolutionValue: number | undefined,
  answerId: string | undefined,
  resolutionData: {
    userIdToContractMetric: {
      [userId: string]: Omit<ContractMetric, 'id'>
    }
    userPayouts: { [userId: string]: number }
    creatorPayout: number
    resolutionProbability?: number
    resolutions?: { [outcome: string]: number }
  }
) => {
  const { token } = contract
  const bulkNotifications: Notification[] = []
  const bulkNoPayoutEmails: EmailAndTemplateEntry[] = []
  const bulkEmails: EmailAndTemplateEntry[] = []
  const bulkPushNotifications: [PrivateUser, Notification, string, string][] =
    []
  const {
    userIdToContractMetric: userIdToContractMetrics,
    userPayouts,
    creatorPayout,
    resolutionProbability,
    resolutions,
  } = resolutionData

  const isMultiChoice =
    contract.outcomeType === 'MULTIPLE_CHOICE' ||
    contract.outcomeType === 'MULTI_NUMERIC' ||
    contract.outcomeType === 'DATE'
  const isIndependentMulti = isMultiChoice && !contract.shouldAnswersSumToOne
  const resolutionText = toDisplayResolution(
    contract,
    outcome,
    resolutionProbability,
    resolutions,
    answerId
  )

  const pg = createSupabaseDirectClient()
  const privateUsers = await pg.map(
    `select private_users.*, users.name from private_users
          join users on private_users.id = users.id
          where private_users.id in
          (select follow_id from contract_follows where contract_id = $1)
          or private_users.id = any($2)`,
    [isIndependentMulti ? '_' : contract.id, Object.keys(userPayouts)],
    (r) => ({ ...convertPrivateUser(r), name: r.name })
  )
  const usersToNotify = uniq(
    privateUsers.map((u) => u.id).filter((id) => id !== resolver.id)
  )

  const sortedProfits = Object.entries(userIdToContractMetrics)
    .map(([userId, metrics]) => {
      const profit = metrics.profit ?? 0
      return { userId, profit }
    })
    .sort((a, b) => b.profit - a.profit)
  const constructNotification = (
    userId: string,
    reason: NotificationReason
  ): Notification => {
    return {
      id: nanoid(6),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: contract.id,
      sourceType: 'contract',
      sourceUpdateType: 'resolved',
      sourceContractId: contract.id,
      sourceUserName: resolver.name,
      sourceUserUsername: resolver.username,
      sourceUserAvatarUrl: resolver.avatarUrl,
      sourceText: resolutionText,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
      data: removeUndefinedProps({
        outcome,
        answerId,
        userInvestment: userIdToContractMetrics?.[userId]?.invested ?? 0,
        userPayout: userPayouts[userId] ?? 0,
        profitRank: sortedProfits.findIndex((p) => p.userId === userId) + 1,
        totalShareholders: sortedProfits.length,
        profit: userIdToContractMetrics?.[userId]?.profit ?? 0,
        token,
      }) as ContractResolutionData,
    }
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: NotificationReason
  ) => {
    const privateUser = privateUsers.find((u) => u.id === userId)
    if (!privateUser) return
    const { sendToBrowser, sendToEmail, sendToMobile } =
      getNotificationDestinationsForUser(privateUser, reason)

    // Browser notifications
    if (sendToBrowser) {
      bulkNotifications.push(constructNotification(userId, reason))
    }

    // Emails notifications
    if (sendToEmail && !contract.isTwitchContract) {
      const email = getMarketResolutionEmail(
        reason,
        privateUser,
        privateUser.name,
        userIdToContractMetrics?.[userId]?.invested ?? 0,
        userPayouts[userId] ?? 0,
        creator,
        creatorPayout,
        contract,
        outcome,
        resolutionProbability,
        resolutions,
        answerId
      )
      if (email && floatingEqual(email.correctedInvestment, 0)) {
        bulkNoPayoutEmails.push(email.entry)
      } else if (email && !floatingEqual(email?.correctedInvestment, 0)) {
        bulkEmails.push(email.entry)
      }
    }
    if (sendToMobile) {
      const notification = constructNotification(userId, reason)
      const { userPayout, profitRank, userInvestment, totalShareholders } =
        notification.data as ContractResolutionData
      const betterThan = (totalShareholders ?? 0) - (profitRank ?? 0)
      const comparison =
        profitRank && totalShareholders && betterThan > 0
          ? `, outperforming ${betterThan} other${betterThan > 1 ? 's' : ''}!`
          : '.'
      const profit = userPayout - userInvestment
      const profitPercent = Math.round((profit / userInvestment) * 100)
      const profitString = ` You made ${formatMoneyEmail(
        profit,
        token
      )} (+${profitPercent}%)`
      const lossString = ` You lost ${formatMoneyEmail(-profit, token)}`
      bulkPushNotifications.push([
        privateUser,
        notification,
        contract.question.length > 50
          ? contract.question.slice(0, 50) + '...'
          : contract.question,
        `Resolved: ${resolutionText}.` +
          (userInvestment === 0 || outcome === 'CANCEL'
            ? ''
            : (profit > 0 ? profitString : lossString) + comparison),
      ])
    }
  }

  await mapAsync(
    usersToNotify,
    (id) =>
      sendNotificationsIfSettingsPermit(
        id,
        userIdToContractMetrics?.[id]?.invested
          ? 'resolutions_on_watched_markets_with_shares_in'
          : 'resolutions_on_watched_markets'
      ),
    20
  )
  await createPushNotifications(bulkPushNotifications)
  await bulkInsertNotifications(bulkNotifications, pg)
  const subjectResolution = toDisplayResolution(
    contract,
    outcome,
    resolutionProbability,
    resolutions,
    answerId
  )
  const subject = `Resolved ${subjectResolution}: ${contract.question}`
  await sendBulkEmails(subject, 'market-resolved-bulk', bulkEmails)
  await sendBulkEmails(
    subject,
    'market-resolved-no-bets-bulk',
    bulkNoPayoutEmails
  )
}

export const createMarketClosedNotification = async (
  contract: Contract,
  creator: User,
  privateUser: PrivateUser,
  idempotencyKey: string
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: creator.id,
    reason: 'your_contract_closed',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'closed',
    sourceContractId: contract?.id,
    sourceUserName: creator.name,
    sourceUserUsername: creator.username,
    sourceUserAvatarUrl: creator.avatarUrl,
    sourceText: contract.closeTime?.toString() ?? new Date().toString(),
    sourceContractCreatorUsername: creator.username,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
  await sendMarketCloseEmail(creator, privateUser, contract)
}
export const createWeeklyPortfolioUpdateNotification = async (
  privateUser: PrivateUser,
  userUsername: string,
  weeklyProfit: number,
  rangeEndDateSlug: string
) => {
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'profit_loss_updates'
  )
  if (!sendToBrowser) return

  const id = rangeEndDateSlug + 'weekly_portfolio_update'

  const notification: Notification = {
    id,
    userId: privateUser.id,
    reason: 'profit_loss_updates',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: id,
    sourceType: 'weekly_portfolio_update',
    sourceUpdateType: 'created',
    sourceUserName: '',
    sourceUserUsername: userUsername,
    sourceUserAvatarUrl: '',
    sourceText: '',
    sourceSlug: rangeEndDateSlug,
    sourceTitle: `Weekly Portfolio Update for ${rangeEndDateSlug}`,
    data: {
      weeklyProfit,
      rangeEndDateSlug,
    },
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createQuestPayoutNotification = async (
  user: User,
  txnId: string,
  payoutAmount: number,
  questCount: number,
  questType: QuestType
) => {
  const privateUser = await getPrivateUser(user.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'quest_payout'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: txnId,
    userId: user.id,
    reason: 'quest_payout',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'quest_reward',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: payoutAmount.toString(),
    sourceTitle: 'Quests',
    data: {
      questType,
      questCount,
    } as QuestRewardTxn['data'],
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBountyAwardedNotification = async (
  userId: string,
  bountyContract: Contract,
  txnId: string,
  bountyAmount: number
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  if (userOptedOutOfBrowserNotifications(privateUser)) return
  const notification: Notification = {
    id: nanoid(6),
    userId: userId,
    reason: 'bounty_awarded',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'contract',
    sourceUserName: bountyContract.creatorName,
    sourceUserUsername: bountyContract.creatorUsername,
    sourceUserAvatarUrl: bountyContract.creatorAvatarUrl ?? '',
    sourceContractCreatorUsername: bountyContract.creatorUsername,
    sourceText: bountyAmount.toString(),
    sourceContractTitle: bountyContract.question,
    sourceContractSlug: bountyContract.slug,
    sourceContractId: txnId,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBountyAddedNotification = async (
  userId: string,
  bountyContract: Contract,
  txnId: string,
  bountyAmount: number
) => {
  const privateUser = await getPrivateUser(userId)
  const sender = await getUser(txnId)
  if (!privateUser || !sender) return
  if (userOptedOutOfBrowserNotifications(privateUser)) return
  const notification: Notification = {
    id: nanoid(6),
    userId: userId,
    reason: 'bounty_added',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'user',
    sourceUserName: sender.name,
    sourceUserUsername: sender.username,
    sourceUserAvatarUrl: sender.avatarUrl ?? '',
    sourceContractCreatorUsername: bountyContract.creatorUsername,
    sourceText: bountyAmount.toString(),
    sourceContractTitle: bountyContract.question,
    sourceContractSlug: bountyContract.slug,
    sourceContractId: bountyContract.id,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBountyCanceledNotification = async (
  contract: Contract,
  amountLeft: number
) => {
  const pg = createSupabaseDirectClient()

  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [contract.id]
  )
  const contractFollowersIds = mapValues(
    keyBy(followerIds, 'follow_id'),
    () => true
  )
  const constructNotification = (
    userId: string,
    reason: notification_preference
  ): Notification => {
    return {
      id: nanoid(6),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: contract.id,
      sourceType: 'contract',
      sourceContractId: contract.id,
      sourceUserName: contract.creatorName,
      sourceUserUsername: contract.creatorUsername,
      sourceUserAvatarUrl: contract.creatorAvatarUrl ?? '',
      sourceText: formatMoney(amountLeft),
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
    }
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )

    // Browser notifications
    if (sendToBrowser) {
      await insertNotificationToSupabase(
        constructNotification(userId, 'bounty_canceled'),
        pg
      )
    }
  }

  const notifyContractFollowers = async () => {
    await mapAsync(
      Object.keys(contractFollowersIds),
      async (userId) => {
        if (userId !== contract.creatorId) {
          return sendNotificationsIfSettingsPermit(userId, 'bounty_canceled')
        }
      },
      20
    )
  }

  log('notifying followers')
  await notifyContractFollowers()
}

export const createVotedOnPollNotification = async (
  voter: User,
  sourceText: string,
  sourceContract: PollContract
) => {
  const pg = createSupabaseDirectClient()
  const privateUsers =
    sourceContract.voterVisibility === 'everyone'
      ? await pg.map(
          `select * from private_users where id in
           (select follow_id from contract_follows where contract_id = $1)
           and id != $2`,
          [sourceContract.id, voter.id],
          convertPrivateUser
        )
      : await pg.map(
          `select * from private_users where id = $1 and id != $2`,
          [sourceContract.creatorId, voter.id],
          convertPrivateUser
        )
  const followerIds = privateUsers.map((user) => user.id)
  const bulkNotifications: Notification[] = []
  const constructNotification = (
    userId: string,
    reason: notification_preference
  ) => {
    const notification: Notification = {
      id: nanoid(6),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: sourceContract.id,
      sourceType: 'contract',
      sourceContractId: sourceContract.id,
      sourceUserName: voter.name,
      sourceUserUsername: voter.username,
      sourceUserAvatarUrl: voter.avatarUrl,
      sourceText,
      sourceContractCreatorUsername: sourceContract.creatorUsername,
      sourceContractTitle: sourceContract.question,
      sourceContractSlug: sourceContract.slug,
      sourceSlug: sourceContract.slug,
      sourceTitle: sourceContract.question,
    }
    return removeUndefinedProps(notification)
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_preference
  ) => {
    const privateUser = privateUsers.find((user) => user.id === userId)
    if (!privateUser || userIsBlocked(privateUser, voter.id)) return

    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )
    // Browser notifications
    if (!sendToBrowser) return
    const notification = constructNotification(userId, reason)
    bulkNotifications.push(notification)
  }

  log('notifying followers')
  forEach(followerIds, (userId) => {
    sendNotificationsIfSettingsPermit(
      userId,
      userId === sourceContract.creatorId
        ? 'vote_on_your_contract'
        : 'all_votes_on_watched_markets'
    )
  })

  await bulkInsertNotifications(bulkNotifications, pg)
}

export const createPollClosedNotification = async (
  sourceText: string,
  sourceContract: Contract
) => {
  const pg = createSupabaseDirectClient()
  const privateUsers = await pg.map(
    `select * from private_users where id in
           (select follow_id from contract_follows where contract_id = $1)`,
    [sourceContract.id],
    convertPrivateUser
  )
  const followerIds = privateUsers.map((user) => user.id)
  const bulkNotifications: Notification[] = []

  const constructNotification = (
    userId: string,
    reason: NotificationReason
  ) => {
    const notification: Notification = {
      id: nanoid(6),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: sourceContract.id,
      sourceType: 'contract',
      sourceContractId: sourceContract.id,
      sourceUserName: sourceContract.creatorName,
      sourceUserUsername: sourceContract.creatorUsername,
      sourceUserAvatarUrl: sourceContract.creatorAvatarUrl ?? '',
      sourceText,
      sourceContractCreatorUsername: sourceContract.creatorUsername,
      sourceContractTitle: sourceContract.question,
      sourceContractSlug: sourceContract.slug,
      sourceSlug: sourceContract.slug,
      sourceTitle: sourceContract.question,
    }
    return removeUndefinedProps(notification)
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: NotificationReason
  ) => {
    const privateUser = privateUsers.find((user) => user.id === userId)
    if (!privateUser) return
    if (userIsBlocked(privateUser, sourceContract.creatorId)) return

    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )

    if (sendToBrowser) {
      const notification = constructNotification(userId, reason)
      bulkNotifications.push(notification)
    }
  }

  log('notifying followers')
  forEach(followerIds, (userId) => {
    sendNotificationsIfSettingsPermit(
      userId,
      userId === sourceContract.creatorId
        ? 'your_poll_closed'
        : 'poll_close_on_watched_markets'
    )
  })
  await bulkInsertNotifications(bulkNotifications, pg)
}

export const createReferralsProgramNotification = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id: userId + 'referrals-program',
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: nanoid(6),
      sourceType: 'referral_program',
      sourceUpdateType: 'created',
      sourceUserName: '',
      sourceUserUsername: '',
      sourceUserAvatarUrl: '',
      sourceText: '',
    }
    await insertNotificationToSupabase(notification, pg)
  }
}
export const createFollowAfterReferralNotification = async (
  userId: string,
  referredByUser: User,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id: referredByUser.id + 'follow-after-referral',
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: referredByUser.id,
      sourceType: 'follow',
      sourceUpdateType: 'created',
      sourceUserName: referredByUser.name,
      sourceUserUsername: referredByUser.username,
      sourceUserAvatarUrl: referredByUser.avatarUrl,
      sourceText: '',
    }
    await insertNotificationToSupabase(notification, pg)
  }
}

export const createFollowSuggestionNotification = async (
  userId: string,
  contract: Contract,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const id = nanoid(6)
  const contractCreator = await getUser(contract.creatorId)
  if (!contractCreator) return

  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id,
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id,
      sourceType: 'follow_suggestion',
      sourceUpdateType: 'created',
      sourceUserName: contractCreator.name,
      sourceUserUsername: contractCreator.username,
      sourceUserAvatarUrl: contractCreator.avatarUrl,
      sourceText: '',
    }
    await insertNotificationToSupabase(notification, pg)
  }
}
export const createMarketReviewedNotification = async (
  userId: string,
  reviewer: User,
  contract: Contract,
  rating: number,
  review: string,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const id = nanoid(6)
  const reason = 'review_on_your_market'
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (sendToBrowser) {
    const notification: Notification = {
      id,
      userId: privateUser.id,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id,
      sourceType: 'market_review',
      sourceUpdateType: 'created',
      sourceUserName: reviewer.name,
      sourceUserUsername: reviewer.username,
      sourceUserAvatarUrl: reviewer.avatarUrl,
      sourceContractId: contract.id,
      sourceContractSlug: contract.slug,
      sourceContractTitle: contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceTitle: contract.question,
      sourceSlug: contract.slug,
      sourceText: '',
      data: {
        rating,
        review,
      } as ReviewNotificationData,
    }
    await insertNotificationToSupabase(notification, pg)
  }
}

export const createMarketReviewUpdatedNotification = async (
  userId: string,
  reviewer: User,
  contract: Contract,
  rating: number,
  review: string,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const id = nanoid(6)
  const reason = 'review_updated_on_your_market'
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (sendToBrowser) {
    const notification: Notification = {
      id,
      userId: privateUser.id,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id,
      sourceType: 'market_review',
      sourceUpdateType: 'updated',
      sourceUserName: reviewer.name,
      sourceUserUsername: reviewer.username,
      sourceUserAvatarUrl: reviewer.avatarUrl,
      sourceContractId: contract.id,
      sourceContractSlug: contract.slug,
      sourceContractTitle: contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceTitle: contract.question,
      sourceSlug: contract.slug,
      sourceText: '',
      data: {
        rating,
        review,
      } as ReviewNotificationData,
    }
    await insertNotificationToSupabase(notification, pg)
  }
}

export const createBetReplyToCommentNotification = async (
  userId: string,
  contract: Contract,
  bet: Bet,
  fromUser: User,
  comment: ContractComment,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const reason = 'reply_to_users_comment'
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (sendToBrowser) {
    const notification: Notification = {
      id: bet.id + 'reply-to' + comment.id,
      userId: privateUser.id,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: bet.id,
      sourceType: 'bet_reply',
      sourceUpdateType: 'created',
      sourceUserName: fromUser.name,
      sourceUserUsername: fromUser.username,
      sourceUserAvatarUrl: fromUser.avatarUrl,
      sourceContractId: contract.id,
      sourceContractSlug: contract.slug,
      sourceContractTitle: contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceTitle: contract.question,
      sourceSlug: contract.slug,
      sourceText: '',
      data: {
        betAmount: bet.amount,
        betOutcome: bet.outcome,
        commentText: richTextToString(comment.content).slice(0, 250),
      } as BetReplyNotificationData,
    }
    await insertNotificationToSupabase(notification, pg)
  }
}

export const createPushNotificationBonusNotification = async (
  privateUser: PrivateUser,
  txnId: string,
  amount: number,
  idempotencyKey: string
) => {
  if (userOptedOutOfBrowserNotifications(privateUser)) return

  const notification: Notification = {
    id: idempotencyKey,
    userId: privateUser.id,
    reason: 'onboarding_flow',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'push_notification_bonus',
    sourceUpdateType: 'created',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: amount.toString(),
    sourceTitle: 'Push Notification Bonus',
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createAirdropNotification = async (
  user: User,
  idempotencyKey: string,
  amount: number
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'airdrop',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: 'airdrop',
    sourceType: 'airdrop',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: '',
    data: {
      amount,
    },
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createManifestAirdropNotification = async (
  user: User,
  idempotencyKey: string,
  amount: number
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'manifest_airdrop',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: 'manifest_airdrop',
    sourceType: 'manifest_airdrop',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: '',
    data: {
      amount,
    },
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createExtraPurchasedManaNotification = async (
  user: User,
  idempotencyKey: string,
  amount: number
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'extra_purchased_mana',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: 'extra_purchased_mana',
    sourceType: 'extra_purchased_mana',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: '',
    data: {
      amount,
    },
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createPaymentSuccessNotification = async (
  paymentData: PaymentCompletedData,
  transactionId: string
) => {
  const notification: Notification = {
    id: nanoid(6),
    userId: paymentData.userId,
    reason: 'payment_status',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: transactionId,
    sourceType: 'payment_status',
    sourceUpdateType: 'created',
    sourceUserName: '',
    sourceUserUsername: '',
    sourceUserAvatarUrl: '',
    sourceText: '',
    data: paymentData,
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createMarketMovementNotification = async (
  params: Array<{
    contract: Contract
    id: string
    privateUser: PrivateUser
    beforeProb: number
    afterProb: number
    beforeTime: Date
    afterTime: Date
    answer?: Answer
  }>
) => {
  const pg = createSupabaseDirectClient()

  // Arrays to collect bulk notifications
  const bulkNotifications: Notification[] = []
  // const bulkEmails: [PrivateUser, Notification, string, string][] = []
  // const bulkPushNotifications: [PrivateUser, Notification, string, string][] =
  //   []

  // Process each notification parameter set
  for (const {
    contract,
    privateUser,
    beforeProb,
    afterProb,
    beforeTime,
    afterTime,
    answer,
    id,
  } of params) {
    // Skip if user blocked the creator
    if (userIsBlocked(privateUser, contract.creatorId)) continue

    // Check notification preferences
    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      'market_movements'
    )

    if (!sendToBrowser) continue

    // Create the notification data
    const notificationData: MarketMovementData = {
      val_start: beforeProb,
      val_end: afterProb,
      val_start_time: beforeTime.toISOString(),
      val_end_time: afterTime.toISOString(),
      answerText: answer?.text,
    }

    // Create the notification
    const notification: Notification = {
      id,
      userId: privateUser.id,
      reason: 'market_movements',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: contract.id,
      sourceType: 'contract',
      sourceContractId: contract.id,
      sourceUserName: contract.creatorName,
      sourceUserUsername: contract.creatorUsername,
      sourceUserAvatarUrl: contract.creatorAvatarUrl ?? '',
      sourceText: answer?.text ?? contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
      data: notificationData,
    }

    if (sendToBrowser) {
      bulkNotifications.push(notification)
    }

    // if (sendToEmail) {
    //   const subject = `Market Update: ${contract.question}`
    //   const probChange = Math.abs(afterProb - beforeProb) * 100
    //   const direction = afterProb > beforeProb ? 'rose' : 'fell'
    //   const body = answer?.text
    //     ? `The answer "${answer.text}" ${direction} from ${Math.round(
    //         beforeProb * 100
    //       )}% to ${Math.round(afterProb * 100)}% (a ${Math.round(
    //         probChange
    //       )}% change)`
    //     : `The probability ${direction} from ${Math.round(
    //         beforeProb * 100
    //       )}% to ${Math.round(afterProb * 100)}% (a ${Math.round(
    //         probChange
    //       )}% change)`

    //   bulkEmails.push([privateUser, notification, subject, body])
    // }

    // if (sendToMobile) {
    //   const title = `${contract.question.substring(0, 50)}${
    //     contract.question.length > 50 ? '...' : ''
    //   }`
    //   const probChange = Math.abs(afterProb - beforeProb) * 100
    //   const direction = afterProb > beforeProb ? 'rose' : 'fell'
    //   const body = answer?.text
    //     ? `The answer "${answer.text}" ${direction} to ${Math.round(
    //         afterProb * 100
    //       )}% (${Math.round(probChange)}% change)`
    //     : `The probability ${direction} to ${Math.round(
    //         afterProb * 100
    //       )}% (${Math.round(probChange)}% change)`

    //   bulkPushNotifications.push([privateUser, notification, title, body])
    // }
  }

  // Send the notifications in bulk
  if (bulkNotifications.length > 0) {
    await bulkInsertNotifications(bulkNotifications, pg)
  }

  // Handle bulk emails (commented out in original code)
  // if (bulkEmails.length > 0) {
  //   // Would need to be updated to handle bulk emails
  //   // await sendMarketMovementEmails(bulkEmails)
  // }

  // Handle bulk push notifications (commented out in original code)
  // if (bulkPushNotifications.length > 0) {
  //   await createPushNotifications(bulkPushNotifications)
  // }

  return bulkNotifications
}

export const createAIDescriptionUpdateNotification = async (
  contract: Contract,
  updateText: string
) => {
  // Defensive: ensure question is a string (in case of data corruption)
  const question =
    typeof contract.question === 'string'
      ? contract.question
      : String(contract.question ?? 'Unknown')

  const notification: Notification = {
    id: nanoid(6),
    userId: contract.creatorId,
    reason: 'admin',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'updated',
    sourceContractId: contract.id,
    sourceUserName: 'Manifold AI',
    sourceUserUsername: 'ManifoldAI',
    sourceUserAvatarUrl: 'https://manifold.markets/logo.svg',
    sourceText: updateText.slice(0, 150),
    sourceContractTitle: question,
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractSlug: contract.slug,
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createPendingClarificationNotification = async (
  contract: Contract,
  clarificationText: string,
  pg: SupabaseDirectClient
) => {
  // Defensive: ensure question is a string (in case of data corruption)
  const question =
    typeof contract.question === 'string'
      ? contract.question
      : String(contract.question ?? 'Unknown')

  const notification: Notification = {
    id: nanoid(6),
    userId: contract.creatorId,
    reason: 'admin',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'updated',
    sourceContractId: contract.id,
    sourceUserName: 'Manifold AI',
    sourceUserUsername: 'ManifoldAI',
    sourceUserAvatarUrl: 'https://manifold.markets/logo.svg',
    sourceText: clarificationText,
    sourceContractTitle: question,
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractSlug: contract.slug,
    data: {
      isPendingClarification: true,
    },
  }

  await insertNotificationToSupabase(notification, pg)
}
