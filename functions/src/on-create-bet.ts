import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { keyBy, uniq } from 'lodash'

import { Bet, LimitBet } from '../../common/bet'
import { getUser, getValues, isProd, log } from './utils'
import {
  createBetFillNotification,
  createBettingStreakBonusNotification,
  createUniqueBettorBonusNotification,
} from './create-notification'
import { filterDefined } from '../../common/util/array'
import { Contract } from '../../common/contract'
import { runTxn, TxnData } from './transact'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  BETTING_STREAK_RESET_HOUR,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from '../../common/economy'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from '../../common/antes'
import { APIError } from '../../common/api'
import { User } from '../../common/user'

const firestore = admin.firestore()
const BONUS_START_DATE = new Date('2022-07-13T15:30:00.000Z').getTime()

export const onCreateBet = functions.firestore
  .document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const { eventId } = context

    const bet = change.data() as Bet
    const lastBetTime = bet.createdTime

    await firestore
      .collection('contracts')
      .doc(contractId)
      .update({ lastBetTime, lastUpdatedTime: Date.now() })

    const userContractSnap = await firestore
      .collection(`contracts`)
      .doc(contractId)
      .get()
    const contract = userContractSnap.data() as Contract

    if (!contract) {
      log(`Could not find contract ${contractId}`)
      return
    }

    const bettor = await getUser(bet.userId)
    if (!bettor) return

    await updateUniqueBettorsAndGiveCreatorBonus(contract, eventId, bettor)
    await notifyFills(bet, contract, eventId, bettor)
    await updateBettingStreak(bettor, bet, contract, eventId)

    await firestore.collection('users').doc(bettor.id).update({ lastBetTime })
  })

const updateBettingStreak = async (
  user: User,
  bet: Bet,
  contract: Contract,
  eventId: string
) => {
  const betStreakResetTime = getTodaysBettingStreakResetTime()
  const lastBetTime = user?.lastBetTime ?? 0

  // If they've already bet after the reset time, or if we haven't hit the reset time yet
  if (lastBetTime > betStreakResetTime || bet.createdTime < betStreakResetTime)
    return

  const newBettingStreak = (user?.currentBettingStreak ?? 0) + 1
  // Otherwise, add 1 to their betting streak
  await firestore.collection('users').doc(user.id).update({
    currentBettingStreak: newBettingStreak,
  })

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
  const result = await firestore.runTransaction(async (trans) => {
    const bonusTxn: TxnData = {
      fromId: fromUserId,
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'BETTING_STREAK_BONUS',
      description: JSON.stringify(bonusTxnDetails),
    }
    return await runTxn(trans, bonusTxn)
  })
  if (!result.txn) {
    log("betting streak bonus txn couldn't be made")
    return
  }

  await createBettingStreakBonusNotification(
    user,
    result.txn.id,
    bet,
    contract,
    bonusAmount,
    eventId
  )
}

const updateUniqueBettorsAndGiveCreatorBonus = async (
  contract: Contract,
  eventId: string,
  bettor: User
) => {
  let previousUniqueBettorIds = contract.uniqueBettorIds

  if (!previousUniqueBettorIds) {
    const contractBets = (
      await firestore.collection(`contracts/${contract.id}/bets`).get()
    ).docs.map((doc) => doc.data() as Bet)

    if (contractBets.length === 0) {
      log(`No bets for contract ${contract.id}`)
      return
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
    await firestore.collection(`contracts`).doc(contract.id).update({
      uniqueBettorIds: newUniqueBettorIds,
      uniqueBettorCount: newUniqueBettorIds.length,
    })
  }

  // No need to give a bonus for the creator's bet
  if (!isNewUniqueBettor || bettor.id == contract.creatorId) return

  // Create combined txn for all new unique bettors
  const bonusTxnDetails = {
    contractId: contract.id,
    uniqueBettorIds: newUniqueBettorIds,
  }
  const fromUserId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
  const fromSnap = await firestore.doc(`users/${fromUserId}`).get()
  if (!fromSnap.exists) throw new APIError(400, 'From user not found.')
  const fromUser = fromSnap.data() as User
  const result = await firestore.runTransaction(async (trans) => {
    const bonusTxn: TxnData = {
      fromId: fromUser.id,
      fromType: 'BANK',
      toId: contract.creatorId,
      toType: 'USER',
      amount: UNIQUE_BETTOR_BONUS_AMOUNT,
      token: 'M$',
      category: 'UNIQUE_BETTOR_BONUS',
      description: JSON.stringify(bonusTxnDetails),
    }
    return await runTxn(trans, bonusTxn)
  })

  if (result.status != 'success' || !result.txn) {
    log(`No bonus for user: ${contract.creatorId} - reason:`, result.status)
  } else {
    log(`Bonus txn for user: ${contract.creatorId} completed:`, result.txn?.id)
    await createUniqueBettorBonusNotification(
      contract.creatorId,
      bettor,
      result.txn.id,
      contract,
      result.txn.amount,
      eventId + '-unique-bettor-bonus'
    )
  }
}

const notifyFills = async (
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

  await Promise.all(
    matchedBets.map((matchedBet) => {
      const matchedUser = betUsersById[matchedBet.userId]
      if (!matchedUser) return

      return createBetFillNotification(
        user,
        matchedUser,
        bet,
        matchedBet,
        contract,
        eventId
      )
    })
  )
}

const getTodaysBettingStreakResetTime = () => {
  return new Date().setUTCHours(BETTING_STREAK_RESET_HOUR, 0, 0, 0)
}
