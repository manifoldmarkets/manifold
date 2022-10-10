import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { keyBy, uniq } from 'lodash'

import { Bet, LimitBet } from '../../common/bet'
import {
  getContractPath,
  getUser,
  getValues,
  isProd,
  log,
  revalidateStaticProps,
} from './utils'
import {
  createBadgeAwardedNotification,
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
import { DAY_MS } from '../../common/util/time'
import { BettingStreakBonusTxn, UniqueBettorBonusTxn } from '../../common/txn'
import {
  StreakerBadge,
  streakerBadgeRarityThresholds,
} from '../../common/badge'

const firestore = admin.firestore()
const BONUS_START_DATE = new Date('2022-07-13T15:30:00.000Z').getTime()

export const onCreateBet = functions
  .runWith({ secrets: ['MAILGUN_KEY', 'API_SECRET'] })
  .firestore.document('contracts/{contractId}/bets/{betId}')
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

    await change.ref.update({
      userAvatarUrl: bettor.avatarUrl,
      userName: bettor.name,
      userUsername: bettor.username,
    })

    await updateUniqueBettorsAndGiveCreatorBonus(contract, eventId, bettor)
    await notifyFills(bet, contract, eventId, bettor)
    await updateBettingStreak(bettor, bet, contract, eventId)

    await revalidateStaticProps(getContractPath(contract))
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
    await trans.update(userDoc, {
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
    await handleBettingStreakBadgeAward(user, newBettingStreak)
  }
}

const updateUniqueBettorsAndGiveCreatorBonus = async (
  oldContract: Contract,
  eventId: string,
  bettor: User
) => {
  const { newUniqueBettorIds } = await firestore.runTransaction(
    async (trans) => {
      const contractDoc = firestore.collection(`contracts`).doc(oldContract.id)
      const contract = (await trans.get(contractDoc)).data() as Contract
      let previousUniqueBettorIds = contract.uniqueBettorIds

      const betsSnap = await trans.get(
        firestore.collection(`contracts/${contract.id}/bets`)
      )
      if (!previousUniqueBettorIds) {
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

        await trans.update(contractDoc, {
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
  if (!newUniqueBettorIds) return

  const bonusTxnDetails = {
    contractId: oldContract.id,
    uniqueNewBettorId: bettor.id,
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

const currentDateBettingStreakResetTime = () => {
  return new Date().setUTCHours(BETTING_STREAK_RESET_HOUR, 0, 0, 0)
}

async function handleBettingStreakBadgeAward(
  user: User,
  newBettingStreak: number
) {
  const alreadyHasBadgeForFirstStreak =
    user.achievements?.streaker?.badges.some(
      (badge) => badge.data.totalBettingStreak === 1
    )
  // TODO: check if already awarded 50th streak as well
  if (newBettingStreak === 1 && alreadyHasBadgeForFirstStreak) return

  if (newBettingStreak in streakerBadgeRarityThresholds) {
    const badge = {
      type: 'STREAKER',
      name: 'Streaker',
      data: {
        totalBettingStreak: newBettingStreak,
      },
      createdTime: Date.now(),
    } as StreakerBadge
    // update user
    await firestore
      .collection('users')
      .doc(user.id)
      .update({
        achievements: {
          ...user.achievements,
          streaker: {
            badges: [...(user.achievements?.streaker?.badges ?? []), badge],
          },
        },
      })
    await createBadgeAwardedNotification(user, badge)
  }
}
