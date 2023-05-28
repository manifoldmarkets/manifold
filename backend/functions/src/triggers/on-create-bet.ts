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
import { floatingEqual } from 'common/util/math'
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
import { getUserPositions } from 'common/calculate'
import { runTxn, TxnData } from 'shared/run-txn'
import { Group } from 'common/group'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient
} from 'shared/supabase/init'
import { bulkUpsert } from 'shared/supabase/utils'
import { secrets } from 'common/secrets'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import {
  completeArchaeologyQuest,
  completeReferralsQuest,
} from 'shared/complete-quest-internal'
import { addToLeagueIfNotInOne } from 'shared/leagues'
import { FieldValue } from 'firebase-admin/firestore'
import { FLAT_TRADE_FEE } from 'common/fees'
import { getUniqueBettorIds } from 'shared/supabase/contracts'

const firestore = admin.firestore()

export const onCreateBet = functions
  .runWith({ secrets, memory: '512MB', timeoutSeconds: 540 })
  .firestore.document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as { contractId: string }
    const { eventId } = context

    const pg = createSupabaseDirectClient()
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
    const impactedUsers = [bettor, ...(notifiedUsers ?? [])]
    await updateContractMetrics(pg, contract, impactedUsers)

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

    await updateUserInterestEmbedding(pg, bettor.id)

    // TODO: Send notification when adding a user to a league.
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

export const updateUniqueBettorsAndGiveCreatorBonus = async (
  oldContract: Contract,
  eventId: string,
  bettor: User,
  bet: Bet
) => {
  const pg = createSupabaseDirectClient()
  // Return if they've already bet on this contract previously, but we'll check in a transaction to be safe
  const previousBet = await pg.oneOrNone(
    `
    select bet_id from contract_bets
    where contract_id = $1
    and user_id = $2
    and created_time < $3
    limit 1`,
    [oldContract.id, bettor.id, new Date(bet.createdTime).toISOString()]
  )
  if (previousBet) return
  const fromUserId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
  const isCreator = bettor.id == oldContract.creatorId
  // They may still have bet on this previously, use a transaction to be sure we haven't sent creator a bonus already
  const result = await firestore.runTransaction(async (trans) => {
    const contractDoc = firestore.collection(`contracts`).doc(oldContract.id)
    const contract = (await trans.get(contractDoc)).data() as Contract

    const txnsSnap = await firestore
      .collection('txns')
      .where('fromId', '==', fromUserId)
      .where('toId', '==', contract.creatorId)
      .where('category', '==', 'UNIQUE_BETTOR_BONUS')
      .where('data.uniqueNewBettorId', '==', bettor.id)
      .where('data.contractId', '==', contract.id)
      .get()

    const refs = txnsSnap.docs.map((doc) => doc.ref)
    const txns = refs.length > 0 ? await trans.getAll(...refs) : []
    const bonusGivenAlready = txns.length > 0
    if (bonusGivenAlready) return
    // two options from here:
    //1. they're the creator, and we don't want to give them a bonus, but they may be a new bettor, so update the bettor count
    //2. they're a new bettor, so update the bettor count and give the creator a bonus
    // if they're the creator: if the bet is not replicated, add 1 to the count and update the count
    const supabaseUniqueBettorIds = await getUniqueBettorIds(contract.id, pg)
    // TODO: NOTE - this may miscount the creator temporarily as a unique bettor multiple times if they place bets
    //  quickly bc of replication delay. It should revert to the true number once other people bet, though
    if (!supabaseUniqueBettorIds.includes(bettor.id))
      supabaseUniqueBettorIds.push(bettor.id)

    if (
      supabaseUniqueBettorIds.length > MAX_TRADERS_FOR_BONUS ||
      // Exclude creator from bonuses
      isCreator ||
      // Exclude unlisted markets from bonuses
      oldContract.visibility === 'unlisted' ||
      // Exclude bots from bonuses
      BOT_USERNAMES.includes(bettor.username)
    ) {
      trans.update(contractDoc, {
        uniqueBettorCount: supabaseUniqueBettorIds.length,
      })
      return
    }

    const bonusTxnData = {
      contractId: oldContract.id,
      uniqueNewBettorId: bettor.id,
    }

    const bonusTxn: TxnData = {
      fromId: fromUserId,
      fromType: 'BANK',
      toId: oldContract.creatorId,
      toType: 'USER',
      amount: UNIQUE_BETTOR_BONUS_AMOUNT,
      token: 'M$',
      category: 'UNIQUE_BETTOR_BONUS',
      description: JSON.stringify(bonusTxnData),
      data: bonusTxnData,
    } as Omit<UniqueBettorBonusTxn, 'id' | 'createdTime'>

    const { status, message, txn } = await runTxn(trans, bonusTxn)
    trans.update(contractDoc, {
      uniqueBettorCount: supabaseUniqueBettorIds.length,
    })
    return { status, newUniqueBettorIds: supabaseUniqueBettorIds, message, txn }
  })
  if (!result) return

  if (oldContract.mechanism === 'cpmm-1') {
    await addHouseSubsidy(oldContract.id, UNIQUE_BETTOR_LIQUIDITY)
  }

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

const updateContractMetrics = async (
  pg: SupabaseDirectClient,
  contract: Contract,
  users: User[]
) => {
  const fsWriter = firestore.bulkWriter({ throttling: false })
  const userBets = await Promise.all(
    users.map(async (user) => {
      const betSnap = await firestore
        .collection(`contracts/${contract.id}/bets`)
        .where('userId', '==', user.id)
        .get()

      const bets = betSnap.docs.map((doc) => doc.data() as Bet)
      return { user, bets }
    })
  )
  for (const { user, bets } of userBets) {
    const newMetrics = calculateUserMetrics(contract, bets, user)
    const doc = firestore
      .collection(`users/${user.id}/contract-metrics`)
      .doc(contract.id)
    fsWriter.set(doc, newMetrics)
  }
  await fsWriter.close()

  const positionRows = userBets.map(({ user, bets }) => {
    const positions = getUserPositions(bets)
    const rows = Object.entries(positions).map(([outcome, position]) => ({
      user_id: user.id,
      contract_id: contract.id,
      outcome,
      basis: position.basis,
      shares: position.shares
    }))
    return rows.filter(r => !floatingEqual(r.shares, 0))
  }).flat()

  await bulkUpsert(
    pg,
    'contract_positions',
    ['user_id', 'contract_id', 'outcome'],
    positionRows
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
