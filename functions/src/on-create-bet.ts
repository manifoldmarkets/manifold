import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { keyBy, uniq } from 'lodash'

import { Bet, LimitBet } from '../../common/bet'
import { getContract, getUser, getValues, isProd, log } from './utils'
import {
  createBetFillNotification,
  createNotification,
} from './create-notification'
import { filterDefined } from '../../common/util/array'
import { Contract } from '../../common/contract'
import { runTxn, TxnData } from './transact'
import { UNIQUE_BETTOR_BONUS_AMOUNT } from '../../common/numeric-constants'
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

    await notifyFills(bet, contractId, eventId)
    await updateUniqueBettorsAndGiveCreatorBonus(
      contractId,
      eventId,
      bet.userId
    )
  })

const updateUniqueBettorsAndGiveCreatorBonus = async (
  contractId: string,
  eventId: string,
  bettorId: string
) => {
  const userContractSnap = await firestore
    .collection(`contracts`)
    .doc(contractId)
    .get()
  const contract = userContractSnap.data() as Contract
  if (!contract) {
    log(`Could not find contract ${contractId}`)
    return
  }
  let previousUniqueBettorIds = contract.uniqueBettorIds

  if (!previousUniqueBettorIds) {
    const contractBets = (
      await firestore
        .collection(`contracts/${contractId}/bets`)
        .where('userId', '!=', contract.creatorId)
        .get()
    ).docs.map((doc) => doc.data() as Bet)

    if (contractBets.length === 0) {
      log(`No bets for contract ${contractId}`)
      return
    }

    previousUniqueBettorIds = uniq(
      contractBets
        .filter((bet) => bet.createdTime < BONUS_START_DATE)
        .map((bet) => bet.userId)
    )
  }

  const isNewUniqueBettor =
    !previousUniqueBettorIds.includes(bettorId) &&
    bettorId !== contract.creatorId

  const newUniqueBettorIds = uniq([...previousUniqueBettorIds, bettorId])
  // Update contract unique bettors
  if (!contract.uniqueBettorIds || isNewUniqueBettor) {
    log(`Got ${previousUniqueBettorIds} unique bettors`)
    isNewUniqueBettor && log(`And a new unique bettor ${bettorId}`)
    await firestore.collection(`contracts`).doc(contractId).update({
      uniqueBettorIds: newUniqueBettorIds,
      uniqueBettorCount: newUniqueBettorIds.length,
    })
  }
  if (!isNewUniqueBettor) return

  // Create combined txn for all new unique bettors
  const bonusTxnDetails = {
    contractId: contractId,
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
    await createNotification(
      result.txn.id,
      'bonus',
      'created',
      fromUser,
      eventId + '-bonus',
      result.txn.amount + '',
      {
        contract,
        slug: contract.slug,
        title: contract.question,
      }
    )
  }
}

const notifyFills = async (bet: Bet, contractId: string, eventId: string) => {
  if (!bet.fills) return

  const user = await getUser(bet.userId)
  if (!user) return
  const contract = await getContract(contractId)
  if (!contract) return

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
