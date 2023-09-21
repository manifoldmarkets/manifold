import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { first, keyBy } from 'lodash'

import { Bet, LimitBet } from 'common/bet'
import {
  getBettingStreakResetTimeBeforeNow,
  getUser,
  getValues,
  log,
} from 'shared/utils'
import {
  createBetFillNotification,
  createBettingStreakBonusNotification,
  createUniqueBettorBonusNotification,
  createReferralNotification,
} from 'shared/create-notification'
import { filterDefined } from 'common/util/array'
import { Contract } from 'common/contract'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  MAX_TRADERS_FOR_BONUS,
  UNIQUE_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_LIQUIDITY,
  REFERRAL_AMOUNT,
} from 'common/economy'
import { User } from 'common/user'
import {
  BettingStreakBonusTxn,
  UniqueBettorBonusTxn,
  ReferralTxn,
} from 'common/txn'
import {
  addHouseSubsidy,
  addHouseSubsidyToAnswer,
} from 'shared/helpers/add-house-subsidy'
import { BOT_USERNAMES } from 'common/envs/constants'
import { addUserToContractFollowers } from 'shared/follow-market'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { GroupResponse } from 'common/group'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { secrets } from 'common/secrets'
import { completeReferralsQuest } from 'shared/complete-quest-internal'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { FieldValue } from 'firebase-admin/firestore'
import { FLAT_TRADE_FEE } from 'common/fees'
import {
  getContractsDirect,
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

const firestore = admin.firestore()

export const onCreateBet = functions
  .runWith({
    secrets,
    memory: '512MB',
    timeoutSeconds: 540,
    minInstances: 10,
  })
  .firestore.document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as { contractId: string }
    const { eventId } = context

    log('onCreateBet', { contractId, eventId })

    const bet = change.data() as Bet
    if (bet.isChallenge) return

    const contracts = await getContractsDirect(
      [contractId],
      createSupabaseDirectClient()
    )
    const contract = first(contracts)
    if (!contract) return

    await firestore.collection('contracts').doc(contract.id).update({
      lastBetTime: bet.createdTime,
      lastUpdatedTime: Date.now(),
    })

    const bettor = await getUser(bet.userId)
    if (!bettor) return

    const notifiedUsers = await notifyUsersOfLimitFills(
      bet,
      contract,
      eventId,
      bettor
    )

    if (bet.shares !== 0) {
      await updateContractMetrics(contract, [bettor, ...(notifiedUsers ?? [])])
    }

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

    // They may be selling out of a position completely, so only add them if they're buying
    if (bet.amount >= 0 && !bet.isSold)
      await addUserToContractFollowers(contractId, bettor.id)

    // Referrals should always be handled before the betting streak bc they both use lastBetTime
    await handleReferral(bettor, eventId)
    await updateBettingStreak(bettor, bet, contract, eventId)

    await giveUniqueBettorAndLiquidityBonus(contract, eventId, bettor, bet)
    await updateUniqueBettors(contract, bet)

    const pg = createSupabaseDirectClient()
    await updateUserInterestEmbedding(pg, bettor.id)

    await addToLeagueIfNotInOne(pg, bettor.id)

    if ((bettor?.lastBetTime ?? 0) < bet.createdTime)
      await firestore
        .doc(`users/${bettor.id}`)
        .update({ lastBetTime: bet.createdTime })

    await addBetToFollowersFeeds(bettor, contract, bet)
  })

const MED_BALANCE_PERCENTAGE_FOR_FEED = 0.005
const MED_BET_SIZE_FOR_FEED = 100

const MIN_BALANCE_PERCENTAGE_FOR_FEED = 0.05
const MIN_BET_SIZE_GIVEN_PERCENTAGE = 20

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
  const { newBettingStreak } = await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.collection('users').doc(user.id)
    const bettor = (await trans.get(userDoc)).data() as User
    const betStreakResetTime = getBettingStreakResetTimeBeforeNow()
    const lastBetTime = bettor?.lastBetTime ?? 0

    // If they've already bet after the reset time
    if (lastBetTime > betStreakResetTime) return { newBettingStreak: undefined }

    const newBettingStreak = (bettor?.currentBettingStreak ?? 0) + 1
    // Otherwise, add 1 to their betting streak
    trans.update(userDoc, {
      currentBettingStreak: newBettingStreak,
      lastBetTime: bet.createdTime,
    })
    return { newBettingStreak }
  })
  if (!newBettingStreak) return
  const result = await firestore.runTransaction(async (trans) => {
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
    return { message, txn, status, bonusAmount }
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
      newBettingStreak,
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
  const isNonPredictive = contract.nonPredictive

  const answer =
    answerId && 'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id == answerId)
      : undefined
  const answerCreatorId = answer?.userId
  const creatorId = answerCreatorId ?? contract.creatorId
  const isCreator = bettor.id == creatorId

  if (isCreator || isBot || isUnlisted || isRedemption || isNonPredictive)
    return

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
      contract.mechanism === 'cpmm-multi-1'
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

  if (contract.mechanism === 'cpmm-1') {
    await addHouseSubsidy(contract.id, UNIQUE_BETTOR_LIQUIDITY)
  } else if (contract.mechanism === 'cpmm-multi-1' && answerId) {
    // There are two ways to subsidize multi answer contracts:
    // 1. Subsidize all answers (and gain efficiency b/c only one answer resolves YES.)
    // 2. Subsidize one answer (and throw away excess YES or NO shares to maintain probability.)
    // The second if preferred if the probability is not extreme, because it increases
    // liquidity in a more traded answer. (Liquidity in less traded or unlikely answers is not that important.)
    if (bet.probAfter < 0.15 || bet.probAfter > 0.95) {
      await addHouseSubsidy(contract.id, UNIQUE_BETTOR_LIQUIDITY)
    } else {
      await addHouseSubsidyToAnswer(
        contract.id,
        answerId,
        UNIQUE_BETTOR_LIQUIDITY
      )
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
    matchedBets.map((bet) => getUser(bet.userId))
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

async function handleReferral(staleUser: User, eventId: string) {
  // Only create a referral txn if the user has a referredByUserId
  if (!staleUser.referredByUserId || staleUser.lastBetTime) return

  const referredByUserId = staleUser.referredByUserId

  await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${staleUser.id}`)
    const user = (await transaction.get(userDoc)).data() as User

    // Double-check the last bet time in the transaction bc otherwise we'll hand out multiple referral bonuses
    if (user.lastBetTime !== undefined) return

    // get user that referred this user
    const referredByUserDoc = firestore.doc(`users/${referredByUserId}`)
    const referredByUserSnap = await transaction.get(referredByUserDoc)
    if (!referredByUserSnap.exists) {
      console.log(`User ${referredByUserId} not found`)
      return
    }
    const referredByUser = referredByUserSnap.data() as User
    console.log(`referredByUser: ${referredByUserId}`)
    if (referredByUser.isBannedFromPosting) {
      console.log('referredByUser is banned, not paying out referral')
      return
    }

    let referredByContract: Contract | undefined = undefined
    if (user.referredByContractId) {
      const referredByContractDoc = firestore.doc(
        `contracts/${user.referredByContractId}`
      )
      referredByContract = await transaction
        .get(referredByContractDoc)
        .then((snap) => snap.data() as Contract)
    }
    console.log(`referredByContract: ${referredByContract?.slug}`)

    let referredByGroup: GroupResponse | undefined = undefined
    if (user.referredByGroupId) {
      const db = createSupabaseClient()
      const groupQuery = await db
        .from('groups')
        .select()
        .eq('id', user.referredByGroupId)
        .limit(1)

      if (groupQuery.data?.length) {
        referredByGroup = groupQuery.data[0]
        console.log(`referredByGroup: ${referredByGroup.slug}`)
      }
    }

    const txns = await transaction.get(
      firestore
        .collection('txns')
        .where('toId', '==', referredByUserId)
        .where('category', '==', 'REFERRAL')
    )
    if (txns.size > 0) {
      // If the referring user already has a referral txn due to referring this user, halt
      if (txns.docs.some((txn) => txn.data()?.description.includes(user.id))) {
        console.log('found referral txn with the same details, aborting')
        return
      }
    }
    console.log('creating referral txns')

    // if they're updating their referredId, create a txn for both
    const txn: ReferralTxn = {
      id: eventId,
      createdTime: Date.now(),
      fromId: 'BANK',
      fromType: 'BANK',
      toId: referredByUserId,
      toType: 'USER',
      amount: REFERRAL_AMOUNT,
      token: 'M$',
      category: 'REFERRAL',
      description: `Referred new user id: ${user.id} for ${REFERRAL_AMOUNT}`,
    }

    const txnDoc = firestore.collection(`txns/`).doc(txn.id)
    transaction.set(txnDoc, txn)
    console.log('created referral with txn id:', txn.id)

    transaction.update(referredByUserDoc, {
      balance: FieldValue.increment(REFERRAL_AMOUNT),
      totalDeposits: FieldValue.increment(REFERRAL_AMOUNT),
    })

    // Set lastBetTime to 0 the first time they bet so they still get a streak bonus, but we don't hand out multiple referral txns
    transaction.update(userDoc, {
      lastBetTime: 0,
    })

    await createReferralNotification(
      referredByUser,
      user,
      txn.amount.toString(),
      referredByContract,
      referredByGroup
    )
    await completeReferralsQuest(referredByUser)
  })
}
