import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { keyBy, uniq } from 'lodash'

import { Bet, LimitBet } from 'common/bet'
import { getUser, getValues, isProd, log } from 'shared/utils'
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
  BETTING_STREAK_RESET_HOUR,
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
import { DAY_MS } from 'common/util/time'
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
import { Group } from 'common/group'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import {
  completeArchaeologyQuest,
  completeReferralsQuest,
} from 'shared/complete-quest-internal'
import { addToLeagueIfNotInOne } from 'shared/leagues'
import { FieldValue } from 'firebase-admin/firestore'
import { FLAT_TRADE_FEE } from 'common/fees'

const firestore = admin.firestore()
const BONUS_START_DATE = new Date('2022-07-13T15:30:00.000Z').getTime()

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

    await updateUniqueBettorsAndGiveCreatorBonus(contract, eventId, bettor, bet)

    await completeArchaeologyQuest(bet, bettor, contract, eventId)

    const pg = createSupabaseDirectClient()
    await updateUserInterestEmbedding(pg, bettor.id)

    // TODO: Send notification when adding a user to a league.
    await addToLeagueIfNotInOne(pg, bettor.id)
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
    const now = Date.now()
    const currentDateResetTime = currentDateBettingStreakResetTime()
    // if now is before reset time, use yesterday's reset time
    const lastDateResetTime = currentDateResetTime - DAY_MS
    const betStreakResetTime =
      now < currentDateResetTime ? lastDateResetTime : currentDateResetTime
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

const updateUniqueBettorsAndGiveCreatorBonus = async (
  oldContract: Contract,
  eventId: string,
  bettor: User,
  bet: Bet
) => {
  const { newUniqueBettorIds } = await firestore.runTransaction(
    async (trans) => {
      const contractDoc = firestore.collection(`contracts`).doc(oldContract.id)
      const contract = (await trans.get(contractDoc)).data() as Contract
      let previousUniqueBettorIds = contract.uniqueBettorIds
      if (!previousUniqueBettorIds) {
        const betsSnap = await trans.get(
          firestore.collection(`contracts/${contract.id}/bets`)
        )
        const contractBets = betsSnap.docs.map((doc) => doc.data() as Bet)

        if (contractBets.length === 0) {
          return { newUniqueBettorIds: undefined }
        }

        previousUniqueBettorIds = uniq(
          contractBets
            .filter((bet) => bet.createdTime < BONUS_START_DATE)
            .map((bet) => bet.userId)
        )
      }

      const isNewUniqueBettor = !previousUniqueBettorIds.includes(bettor.id)
      const newUniqueBettorIds = uniq([...previousUniqueBettorIds, bettor.id])

      // Update contract unique bettors
      if (!contract.uniqueBettorIds || isNewUniqueBettor) {
        log(`Got ${previousUniqueBettorIds} unique bettors`)
        isNewUniqueBettor && log(`And a new unique bettor ${bettor.id}`)

        trans.update(contractDoc, {
          uniqueBettorIds: newUniqueBettorIds,
          uniqueBettorCount: newUniqueBettorIds.length,
        })
      }

      // No need to give a bonus for the creator's bet
      if (!isNewUniqueBettor || bettor.id == contract.creatorId)
        return { newUniqueBettorIds: undefined }

      return { newUniqueBettorIds }
    }
  )

  if (!newUniqueBettorIds || newUniqueBettorIds.length > MAX_TRADERS_FOR_BONUS)
    return

  // exclude unlisted markets from bonuses
  if (oldContract.visibility === 'unlisted') return

  // exclude bots from bonuses
  if (BOT_USERNAMES.includes(bettor.username)) return

  if (oldContract.mechanism === 'cpmm-1') {
    await addHouseSubsidy(oldContract.id, UNIQUE_BETTOR_LIQUIDITY)
  }

  const bonusTxnDetails = {
    contractId: oldContract.id,
    uniqueNewBettorId: bettor.id,
  }
  const fromUserId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

  const result = await firestore.runTransaction(async (trans) => {
    const bonusTxn: TxnData = {
      fromId: fromUserId,
      fromType: 'BANK',
      toId: oldContract.creatorId,
      toType: 'USER',
      amount: UNIQUE_BETTOR_BONUS_AMOUNT,
      token: 'M$',
      category: 'UNIQUE_BETTOR_BONUS',
      description: JSON.stringify(bonusTxnDetails),
      data: bonusTxnDetails,
    } as Omit<UniqueBettorBonusTxn, 'id' | 'createdTime'>

    const { status, message, txn } = await runTxn(trans, bonusTxn)

    return { status, newUniqueBettorIds, message, txn }
  })

  if (result.status != 'success' || !result.txn) {
    log(`No bonus for user: ${oldContract.creatorId} - status:`, result.status)
    log('message:', result.message)
  } else {
    log(
      `Bonus txn for user: ${oldContract.creatorId} completed:`,
      result.txn?.id
    )
    await createUniqueBettorBonusNotification(
      oldContract.creatorId,
      bettor,
      result.txn.id,
      oldContract,
      result.txn.amount,
      result.newUniqueBettorIds,
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
      matchedBets.map((matchedBet) => {
        const matchedUser = betUsersById[matchedBet.userId]
        if (!matchedUser) return

        createBetFillNotification(
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

const currentDateBettingStreakResetTime = () => {
  return new Date().setUTCHours(BETTING_STREAK_RESET_HOUR, 0, 0, 0)
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

    let referredByGroup: Group | undefined = undefined
    if (user.referredByGroupId) {
      const referredByGroupDoc = firestore.doc(
        `groups/${user.referredByGroupId}`
      )
      referredByGroup = await transaction
        .get(referredByGroupDoc)
        .then((snap) => snap.data() as Group)
    }
    console.log(`referredByGroup: ${referredByGroup?.slug}`)

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
    // We're currently not subtracting Ṁ from the house, not sure if we want to for accounting purposes.
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
