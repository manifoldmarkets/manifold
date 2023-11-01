import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, keyBy, sumBy } from 'lodash'

import { Bet, LimitBet } from 'common/bet'
import {
  getBettingStreakResetTimeBeforeNow,
  getContract,
  getUser,
  getUserSupabase,
  getValues,
  isProd,
  log,
} from 'shared/utils'
import {
  createBetFillNotification,
  createBetReplyToCommentNotification,
  createBettingStreakBonusNotification,
  createFollowSuggestionNotification,
  createUniqueBettorBonusNotification,
} from 'shared/create-notification'
import { filterDefined } from 'common/util/array'
import { Contract } from 'common/contract'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  MAX_TRADERS_FOR_BIG_BONUS,
  MAX_TRADERS_FOR_BONUS,
  SMALL_UNIQUE_BETTOR_BONUS_AMOUNT,
  SMALL_UNIQUE_BETTOR_LIQUIDITY,
  UNIQUE_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_LIQUIDITY,
} from 'common/economy'
import { User } from 'common/user'
import { BettingStreakBonusTxn, UniqueBettorBonusTxn } from 'common/txn'
import {
  addHouseSubsidy,
  addHouseSubsidyToAnswer,
} from 'shared/helpers/add-house-subsidy'
import { BOT_USERNAMES } from 'common/envs/constants'
import { addUserToContractFollowers } from 'shared/follow-market'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { runTxnFromBank } from 'shared/txn/run-txn'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { secrets } from 'common/secrets'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { FieldValue } from 'firebase-admin/firestore'
import { FLAT_TRADE_FEE } from 'common/fees'
import {
  getUniqueBettorIds,
  getUniqueBettorIdsForAnswer,
} from 'shared/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { Answer } from 'common/answer'
import { getUserMostChangedPosition } from 'common/supabase/bets'
import { addBetDataToUsersFeeds } from 'shared/create-feed'
import { MINUTE_MS } from 'common/util/time'
import { ContractComment } from 'common/comment'
import { getBetsRepliedToComment } from 'shared/supabase/bets'

const firestore = admin.firestore()

export const onCreateBet = functions
  .runWith({
    secrets,
    memory: '512MB',
    timeoutSeconds: 540,
    minInstances: isProd() ? 10 : 0,
  })
  .firestore.document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as { contractId: string }
    const { eventId } = context

    log('onCreateBet', { contractId, eventId })

    const bet = change.data() as Bet
    if (bet.isChallenge) return

    const contract = await getContract(contractId)
    if (!contract) {
      log(`No contract: ${contractId} found for bet: ${bet.id}`)
      return
    }

    await firestore.collection('contracts').doc(contract.id).update({
      lastBetTime: bet.createdTime,
      lastUpdatedTime: Date.now(),
    })

    const bettor = await getUser(bet.userId)
    if (!bettor) {
      log(
        `No user:${bet.userId} found for bet: ${bet.id} on contract: ${contract.id}`
      )
      return
    }

    const notifiedUsers = await notifyUsersOfLimitFills(
      bet,
      contract,
      eventId,
      bettor
    )

    if (bet.shares !== 0) {
      await updateContractMetrics(contract, [bettor, ...(notifiedUsers ?? [])])
    }

    // Note: Anything that applies to redemption bets should be above this line.
    if (bet.isRedemption) return
    const pg = createSupabaseDirectClient()

    if (bet.replyToCommentId)
      await handleBetReplyToComment(bet, contract, bettor, pg)

    const isApiOrBot = bet.isApi || BOT_USERNAMES.includes(bettor.username)
    if (isApiOrBot) {
      // assess flat fee for bots
      const userRef = firestore.doc(`users/${bettor.id}`)
      await userRef.update({
        balance: FieldValue.increment(-FLAT_TRADE_FEE),
        totalDeposits: FieldValue.increment(-FLAT_TRADE_FEE),
      })

      if (bet.isApi) return // skip the rest only if it's an API bet
    }

    /**
     *  Handle bonuses, other stuff for non-bot users below:
     */

    // Follow suggestion should be before betting streak update (which updates lastBetTime)
    !bettor.lastBetTime &&
      !bettor.referredByUserId &&
      (await createFollowSuggestionNotification(bettor.id, contract, pg))

    await updateBettingStreak(bettor, bet, contract, eventId)
    await giveUniqueBettorAndLiquidityBonus(contract, eventId, bettor, bet)

    await Promise.all([
      // They may be selling out of a position completely, so only add them if they're buying
      bet.amount >= 0 &&
        !bet.isSold &&
        addUserToContractFollowers(contractId, bettor.id),

      updateUniqueBettors(contract, bet),

      updateUserInterestEmbedding(pg, bettor.id),

      addToLeagueIfNotInOne(pg, bettor.id),

      (bettor.lastBetTime ?? 0) < bet.createdTime &&
        firestore
          .doc(`users/${bettor.id}`)
          .update({ lastBetTime: bet.createdTime }),

      addBetToFollowersFeeds(bettor, contract, bet),
    ])
  })

const MED_BALANCE_PERCENTAGE_FOR_FEED = 0.005
const MED_BET_SIZE_FOR_FEED = 100

const MIN_BALANCE_PERCENTAGE_FOR_FEED = 0.05
const MIN_BET_SIZE_GIVEN_PERCENTAGE = 20

const handleBetReplyToComment = async (
  bet: Bet,
  contract: Contract,
  bettor: User,
  pg: SupabaseDirectClient
) => {
  const commentSnap = await firestore
    .doc(`contracts/${contract.id}/comments/${bet.replyToCommentId}`)
    .get()
  const comment = commentSnap.data() as ContractComment
  if (comment.userId === bettor.id) return
  if (comment) {
    const bets = filterDefined(await getBetsRepliedToComment(pg, comment.id))
    // This could potentially miss some bets if they're not replicated in time
    if (!bets.some((b) => b.id === bet.id)) bets.push(bet)
    const groupedBetsByOutcome = groupBy(bets, 'outcome')
    const betReplyAmountsByOutcome: { [outcome: string]: number } = {}
    for (const outcome in groupedBetsByOutcome) {
      betReplyAmountsByOutcome[outcome] = sumBy(
        groupedBetsByOutcome[outcome],
        (b) => b.amount
      )
    }
    await commentSnap.ref.update({
      betReplyAmountsByOutcome,
    })
  }
  await createBetReplyToCommentNotification(
    comment.userId,
    contract,
    bet,
    bettor,
    comment,
    pg
  )
}

const addBetToFollowersFeeds = async (
  bettor: User,
  contract: Contract,
  bet: Bet
) => {
  if (contract.mechanism === 'dpm-2') return
  const positionChange = await getUserMostChangedPosition(
    bettor,
    contract,
    bet.createdTime - 10 * MINUTE_MS,
    createSupabaseClient()
  )
  if (!positionChange) return
  const percentUsersBalance = positionChange.change / bettor.balance
  if (
    // For shrimp
    (percentUsersBalance > MIN_BALANCE_PERCENTAGE_FOR_FEED &&
      positionChange.change >= MIN_BET_SIZE_GIVEN_PERCENTAGE) ||
    // For dolphins/whales
    (percentUsersBalance > MED_BALANCE_PERCENTAGE_FOR_FEED &&
      positionChange.change >= MED_BET_SIZE_FOR_FEED)
  )
    await addBetDataToUsersFeeds(
      contract,
      bettor,
      positionChange,
      `${contract.id}-${bettor.id}-${
        positionChange.change
      }-${new Date().toLocaleDateString()}`
    )
}

const updateBettingStreak = async (
  user: User,
  bet: Bet,
  contract: Contract,
  eventId: string
) => {
  const result = await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.collection('users').doc(user.id)
    const bettor = (await trans.get(userDoc)).data() as User
    const betStreakResetTime = getBettingStreakResetTimeBeforeNow()
    const lastBetTime = bettor.lastBetTime ?? 0

    // If they've already bet after the reset time
    if (lastBetTime > betStreakResetTime)
      return {
        message: 'User has already bet after the reset time',
        status: 'error',
      }

    const newBettingStreak = (bettor?.currentBettingStreak ?? 0) + 1
    // Otherwise, add 1 to their betting streak
    trans.update(userDoc, {
      currentBettingStreak: newBettingStreak,
      lastBetTime: bet.createdTime,
    })
    // Send them the bonus times their streak
    const bonusAmount = Math.min(
      BETTING_STREAK_BONUS_AMOUNT * newBettingStreak,
      BETTING_STREAK_BONUS_MAX
    )

    const bonusTxnDetails = {
      currentBettingStreak: newBettingStreak,
    }

    const bonusTxn: Omit<
      BettingStreakBonusTxn,
      'id' | 'createdTime' | 'fromId'
    > = {
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'BETTING_STREAK_BONUS',
      description: JSON.stringify(bonusTxnDetails),
      data: bonusTxnDetails,
    }
    const { message, txn, status } = await runTxnFromBank(trans, bonusTxn)
    return { message, txn, status, bonusAmount, newBettingStreak }
  })

  if (result.status != 'success') {
    log("betting streak bonus txn couldn't be made")
    log('status:', result.status)
    log('message:', result.message)
    return
  }
  if (result.txn) {
    await createBettingStreakBonusNotification(
      user,
      result.txn.id,
      bet,
      contract,
      result.bonusAmount,
      result.newBettingStreak,
      eventId
    )
  }
}

export const updateUniqueBettors = async (contract: Contract, bet: Bet) => {
  const pg = createSupabaseDirectClient()
  const contractDoc = firestore.collection(`contracts`).doc(contract.id)
  const supabaseUniqueBettorIds = await getUniqueBettorIds(contract.id, pg)
  if (!supabaseUniqueBettorIds.includes(bet.userId))
    supabaseUniqueBettorIds.push(bet.userId)

  if (contract.uniqueBettorCount == supabaseUniqueBettorIds.length) return
  await contractDoc.update({
    uniqueBettorCount: supabaseUniqueBettorIds.length,
  })
}

export const giveUniqueBettorAndLiquidityBonus = async (
  contract: Contract,
  eventId: string,
  bettor: User,
  bet: Bet
) => {
  const { answerId, isRedemption } = bet
  const pg = createSupabaseDirectClient()

  const isBot = BOT_USERNAMES.includes(bettor.username)
  const isUnlisted = contract.visibility === 'unlisted'
  const unSubsidised = !contract.isSubsidised

  const answer =
    answerId && 'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id == answerId)
      : undefined
  const answerCreatorId = answer?.userId
  const creatorId = answerCreatorId ?? contract.creatorId
  const isCreator = bettor.id == creatorId

  if (isCreator || isBot || isUnlisted || isRedemption || unSubsidised) return

  const previousBet = answerId
    ? await pg.oneOrNone(
        `select bet_id from contract_bets
        where contract_id = $1
          and data->>'answerId' = $2
          and user_id = $3
          and created_time < $4
          and is_redemption = false
        limit 1`,
        [
          contract.id,
          answerId,
          bettor.id,
          new Date(bet.createdTime - 1).toISOString(),
        ]
      )
    : await pg.oneOrNone(
        `select bet_id from contract_bets
        where contract_id = $1
          and user_id = $2
          and created_time < $3
        limit 1`,
        [contract.id, bettor.id, new Date(bet.createdTime).toISOString()]
      )
  // Check previous bet.
  if (previousBet) return

  // For bets with answerId (multiple choice), give a bonus for the first bet on each answer.
  // NOTE: this may miscount unique bettors if they place multiple bets quickly b/c of replication delay.
  const uniqueBettorIds = answerId
    ? await getUniqueBettorIdsForAnswer(contract.id, answerId, pg)
    : await getUniqueBettorIds(contract.id, pg)
  if (!uniqueBettorIds.includes(bettor.id)) uniqueBettorIds.push(bettor.id)

  // Check max bonus exceeded.
  if (uniqueBettorIds.length > MAX_TRADERS_FOR_BONUS) return

  // They may still have bet on this previously, use a transaction to be sure
  // we haven't sent creator a bonus already
  const result = await firestore.runTransaction(async (trans) => {
    const query = firestore
      .collection('txns')
      .where('fromType', '==', 'BANK')
      .where('toId', '==', creatorId)
      .where('category', '==', 'UNIQUE_BETTOR_BONUS')
      .where('data.uniqueNewBettorId', '==', bettor.id)
      .where('data.contractId', '==', contract.id)
    const queryWithMaybeAnswer = answerId
      ? query.where('data.answerId', '==', answerId)
      : query
    const txnsSnap = await queryWithMaybeAnswer.get()
    const bonusGivenAlready = txnsSnap.docs.length > 0
    if (bonusGivenAlready) return undefined

    const bonusTxnData = removeUndefinedProps({
      contractId: contract.id,
      uniqueNewBettorId: bettor.id,
      answerId,
    })

    const bonusAmount =
      uniqueBettorIds.length > MAX_TRADERS_FOR_BIG_BONUS
        ? SMALL_UNIQUE_BETTOR_BONUS_AMOUNT
        : contract.mechanism === 'cpmm-multi-1'
        ? Math.ceil(UNIQUE_BETTOR_BONUS_AMOUNT / 2)
        : UNIQUE_BETTOR_BONUS_AMOUNT

    const bonusTxn: Omit<
      UniqueBettorBonusTxn,
      'id' | 'createdTime' | 'fromId'
    > = {
      fromType: 'BANK',
      toId: creatorId,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'UNIQUE_BETTOR_BONUS',
      description: JSON.stringify(bonusTxnData),
      data: bonusTxnData,
    }

    return await runTxnFromBank(trans, bonusTxn)
  })
  if (!result) return

  const subsidy =
    uniqueBettorIds.length <= MAX_TRADERS_FOR_BIG_BONUS
      ? UNIQUE_BETTOR_LIQUIDITY
      : SMALL_UNIQUE_BETTOR_LIQUIDITY

  if (contract.mechanism === 'cpmm-1') {
    await addHouseSubsidy(contract.id, subsidy)
  } else if (contract.mechanism === 'cpmm-multi-1' && answerId) {
    if (
      contract.shouldAnswersSumToOne &&
      (bet.probAfter < 0.15 || bet.probAfter > 0.95)
    ) {
      // There are two ways to subsidize multi answer contracts when they sum to one:
      // 1. Subsidize all answers (and gain efficiency b/c only one answer resolves YES.)
      // 2. Subsidize one answer (and throw away excess YES or NO shares to maintain probability.)
      // The second if preferred if the probability is not extreme, because it increases
      // liquidity in a more traded answer. (Liquidity in less traded or unlikely answers is not that important.)
      await addHouseSubsidy(contract.id, subsidy)
    } else {
      await addHouseSubsidyToAnswer(contract.id, answerId, subsidy)
    }
  }

  if (result.status != 'success' || !result.txn) {
    log(`No bonus for user: ${contract.creatorId} - status:`, result.status)
    log('message:', result.message)
  } else {
    log(`Bonus txn for user: ${contract.creatorId} completed:`, result.txn?.id)
    const overallUniqueBettorIds = answerId
      ? await getUniqueBettorIds(contract.id, pg)
      : uniqueBettorIds

    await createUniqueBettorBonusNotification(
      creatorId,
      bettor,
      result.txn.id,
      contract,
      result.txn.amount,
      overallUniqueBettorIds,
      eventId + '-unique-bettor-bonus',
      bet
    )
  }
}

const notifyUsersOfLimitFills = async (
  bet: Bet,
  contract: Contract,
  eventId: string,
  user: User
) => {
  if (!bet.fills) return

  const matchedFills = bet.fills.filter((fill) => fill.matchedBetId !== null)
  const matchedBets = (
    await Promise.all(
      matchedFills.map((fill) =>
        getValues<LimitBet>(
          firestore.collectionGroup('bets').where('id', '==', fill.matchedBetId)
        )
      )
    )
  ).flat()

  const betUsers = await Promise.all(
    matchedBets.map((bet) => getUserSupabase(bet.userId))
  )
  const betUsersById = keyBy(filterDefined(betUsers), 'id')

  return filterDefined(
    await Promise.all(
      matchedBets.map(async (matchedBet) => {
        const matchedUser = betUsersById[matchedBet.userId]
        if (!matchedUser) return undefined

        await createBetFillNotification(
          user,
          matchedUser,
          bet,
          matchedBet,
          contract,
          eventId
        )
        return matchedUser
      })
    )
  )
}

const updateContractMetrics = async (contract: Contract, users: User[]) => {
  const metrics = await Promise.all(
    users.map(async (user) => {
      const betSnap = await firestore
        .collection(`contracts/${contract.id}/bets`)
        .where('userId', '==', user.id)
        .get()

      const bets = betSnap.docs.map((doc) => doc.data() as Bet)
      return calculateUserMetrics(contract, bets, user)
    })
  )

  await bulkUpdateContractMetrics(metrics)
}
