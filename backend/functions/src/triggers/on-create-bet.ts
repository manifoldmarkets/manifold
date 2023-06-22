import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { keyBy } from 'lodash'

import { Bet, LimitBet } from 'common/bet'
import {
  getBettingStreakResetTimeBeforeNow,
  getUser,
  getValues,
  isProd,
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
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { User } from 'common/user'
import {
  BettingStreakBonusTxn,
  UniqueBettorBonusTxn,
  ReferralTxn,
} from 'common/txn'
import { addHouseSubsidy } from 'shared/helpers/add-house-subsidy'
import { BOT_USERNAMES } from 'common/envs/constants'
import { addUserToContractFollowers } from 'shared/follow-market'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { runTxn, TxnData } from 'shared/run-txn'
import { GroupResponse } from 'common/group'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { secrets } from 'common/secrets'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import {
  completeArchaeologyQuest,
  completeReferralsQuest,
} from 'shared/complete-quest-internal'
import { addToLeagueIfNotInOne } from 'shared/generate-leagues'
import { FieldValue } from 'firebase-admin/firestore'
import { FLAT_TRADE_FEE } from 'common/fees'
import {
  getUniqueBettorIds,
  getUniqueBettorIdsForAnswer,
} from 'shared/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'

const firestore = admin.firestore()

export const onCreateBet = functions
  .runWith({ secrets, memory: '512MB', timeoutSeconds: 540 })
  .firestore.document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as { contractId: string }
    const { eventId } = context

    const bet = change.data() as Bet
    if (bet.isChallenge) return

    const contractRef = firestore.collection('contracts').doc(contractId)
    const contractSnap = await contractRef.get()
    const contract = contractSnap.data() as Contract
    if (!contract) return
    await contractRef.update({
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
    await updateContractMetrics(contract, [bettor, ...(notifiedUsers ?? [])])

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

    await completeArchaeologyQuest(bet, bettor, contract, eventId)

    const pg = createSupabaseDirectClient()
    await updateUserInterestEmbedding(pg, bettor.id)

    await addToLeagueIfNotInOne(pg, bettor.id)

    if ((bettor?.lastBetTime ?? 0) < bet.createdTime)
      await firestore
        .doc(`users/${bettor.id}`)
        .update({ lastBetTime: bet.createdTime })
  })

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
    const fromUserId = isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
    const bonusTxnDetails = {
      currentBettingStreak: newBettingStreak,
    }

    const bonusTxn: TxnData = {
      fromId: fromUserId,
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'BETTING_STREAK_BONUS',
      description: JSON.stringify(bonusTxnDetails),
      data: bonusTxnDetails,
    } as Omit<BettingStreakBonusTxn, 'id' | 'createdTime'>
    const { message, txn, status } = await runTxn(trans, bonusTxn)
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

  const isCreator = bettor.id == contract.creatorId
  const isBot = BOT_USERNAMES.includes(bettor.username)
  const isUnlisted = contract.visibility === 'unlisted'

  if (isCreator || isBot || isUnlisted || isRedemption) return

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
    const fromUserId = isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
    const query = firestore
      .collection('txns')
      .where('fromId', '==', fromUserId)
      .where('toId', '==', contract.creatorId)
      .where('category', '==', 'UNIQUE_BETTOR_BONUS')
      .where('data.uniqueNewBettorId', '==', bettor.id)
      .where('data.contractId', '==', contract.id)
    const queryWithMaybeAnswer = answerId
      ? query.where('data.answerId', '==', answerId)
      : query
    const txnsSnap = await queryWithMaybeAnswer.get()

    const refs = txnsSnap.docs.map((doc) => doc.ref)
    const txns = refs.length > 0 ? await trans.getAll(...refs) : []
    const bonusGivenAlready = txns.length > 0
    if (bonusGivenAlready) return undefined

    const bonusTxnData = removeUndefinedProps({
      contractId: contract.id,
      uniqueNewBettorId: bettor.id,
      answerId,
    })

    const bonusTxn: TxnData = {
      fromId: fromUserId,
      fromType: 'BANK',
      toId: contract.creatorId,
      toType: 'USER',
      amount: UNIQUE_BETTOR_BONUS_AMOUNT,
      token: 'M$',
      category: 'UNIQUE_BETTOR_BONUS',
      description: JSON.stringify(bonusTxnData),
      data: bonusTxnData,
    } as Omit<UniqueBettorBonusTxn, 'id' | 'createdTime'>

    const { status, message, txn } = await runTxn(trans, bonusTxn)
    return { status, message, txn }
  })
  if (!result) return

  if (
    contract.mechanism === 'cpmm-1' ||
    contract.mechanism === 'cpmm-multi-1'
  ) {
    await addHouseSubsidy(contract.id, UNIQUE_BETTOR_LIQUIDITY)
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
      contract.creatorId,
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
  await Promise.all(
    users.map(async (user) => {
      const betSnap = await firestore
        .collection(`contracts/${contract.id}/bets`)
        .where('userId', '==', user.id)
        .get()

      const bets = betSnap.docs.map((doc) => doc.data() as Bet)
      const newMetrics = calculateUserMetrics(contract, bets, user)

      await firestore
        .collection(`users/${user.id}/contract-metrics`)
        .doc(contract.id)
        .set(newMetrics)
    })
  )
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
      if (txns.docs.some((txn) => txn.data()?.description === user.id)) {
        console.log('found referral txn with the same details, aborting')
        return
      }
    }
    console.log('creating referral txns')
    const fromId = HOUSE_LIQUIDITY_PROVIDER_ID

    // if they're updating their referredId, create a txn for both
    const txn: ReferralTxn = {
      id: eventId,
      createdTime: Date.now(),
      fromId,
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
      balance: referredByUser.balance + REFERRAL_AMOUNT,
      totalDeposits: referredByUser.totalDeposits + REFERRAL_AMOUNT,
    })

    // Set lastBetTime to 0 the first time they bet so they still get a streak bonus, but we don't hand out multiple referral txns
    transaction.update(userDoc, {
      lastBetTime: 0,
    })

    await createReferralNotification(
      referredByUser,
      user,
      eventId,
      txn.amount.toString(),
      referredByContract,
      referredByGroup
    )
    await completeReferralsQuest(referredByUser)
  })
}
