import { APIError, newEndpoint } from './api'
import { isProd, log } from './utils'
import * as admin from 'firebase-admin'
import { PrivateUser } from '../../common/lib/user'
import { uniq } from 'lodash'
import { Bet } from '../../common/lib/bet'
const firestore = admin.firestore()
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from '../../common/antes'
import { runTxn, TxnData } from './transact'
import { createNotification } from './create-notification'
import { User } from '../../common/lib/user'
import { Contract } from '../../common/lib/contract'
import { UNIQUE_BETTOR_BONUS_AMOUNT } from '../../common/numeric-constants'

const BONUS_START_DATE = new Date('2022-07-01T00:00:00.000Z').getTime()
const QUERY_LIMIT_SECONDS = 60

export const getdailybonuses = newEndpoint({}, async (req, auth) => {
  const { user, lastTimeCheckedBonuses } = await firestore.runTransaction(
    async (trans) => {
      const userSnap = await trans.get(
        firestore.doc(`private-users/${auth.uid}`)
      )
      if (!userSnap.exists) throw new APIError(400, 'User not found.')
      const user = userSnap.data() as PrivateUser
      const lastTimeCheckedBonuses = user.lastTimeCheckedBonuses ?? 0
      if (Date.now() - lastTimeCheckedBonuses < QUERY_LIMIT_SECONDS * 1000)
        throw new APIError(
          400,
          `Limited to one query per user per ${QUERY_LIMIT_SECONDS} seconds.`
        )
      await trans.update(userSnap.ref, {
        lastTimeCheckedBonuses: Date.now(),
      })
      return {
        user,
        lastTimeCheckedBonuses,
      }
    }
  )
  const fromUserId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
  const fromSnap = await firestore.doc(`users/${fromUserId}`).get()
  if (!fromSnap.exists) throw new APIError(400, 'From user not found.')
  const fromUser = fromSnap.data() as User
  // Get all users contracts made since implementation time
  const userContractsSnap = await firestore
    .collection(`contracts`)
    .where('creatorId', '==', user.id)
    .where('createdTime', '>=', BONUS_START_DATE)
    .get()
  const userContracts = userContractsSnap.docs.map(
    (doc) => doc.data() as Contract
  )
  const nullReturn = { status: 'no bets', txn: null }
  for (const contract of userContracts) {
    const result = await firestore.runTransaction(async (trans) => {
      const contractId = contract.id
      // Get all bets made on user's contracts
      const bets = (
        await firestore
          .collection(`contracts/${contractId}/bets`)
          .where('userId', '!=', user.id)
          .get()
      ).docs.map((bet) => bet.ref)
      if (bets.length === 0) {
        return nullReturn
      }
      const contractBetsSnap = await trans.getAll(...bets)
      const contractBets = contractBetsSnap.map((doc) => doc.data() as Bet)

      const uniqueBettorIdsBeforeLastResetTime = uniq(
        contractBets
          .filter((bet) => bet.createdTime < lastTimeCheckedBonuses)
          .map((bet) => bet.userId)
      )

      // Filter users for ONLY those that have made bets since the last daily bonus received time
      const uniqueBettorIdsWithBetsAfterLastResetTime = uniq(
        contractBets
          .filter((bet) => bet.createdTime > lastTimeCheckedBonuses)
          .map((bet) => bet.userId)
      )

      // Filter for users only present in the above list
      const newUniqueBettorIds =
        uniqueBettorIdsWithBetsAfterLastResetTime.filter(
          (userId) => !uniqueBettorIdsBeforeLastResetTime.includes(userId)
        )
      newUniqueBettorIds.length > 0 &&
        log(
          `Got ${newUniqueBettorIds.length} new unique bettors since last bonus`
        )
      if (newUniqueBettorIds.length === 0) {
        return nullReturn
      }
      // Create combined txn for all unique bettors
      const bonusTxnDetails = {
        contractId: contractId,
        uniqueBettors: newUniqueBettorIds.length,
      }
      const bonusTxn: TxnData = {
        fromId: fromUser.id,
        fromType: 'BANK',
        toId: user.id,
        toType: 'USER',
        amount: UNIQUE_BETTOR_BONUS_AMOUNT * newUniqueBettorIds.length,
        token: 'M$',
        category: 'UNIQUE_BETTOR_BONUS',
        description: JSON.stringify(bonusTxnDetails),
      }
      return await runTxn(trans, bonusTxn)
    })

    if (result.status != 'success' || !result.txn) {
      result.status != nullReturn.status &&
        log(`No bonus for user: ${user.id} - reason:`, result.status)
    } else {
      log(`Bonus txn for user: ${user.id} completed:`, result.txn?.id)
      await createNotification(
        result.txn.id,
        'bonus',
        'created',
        fromUser,
        result.txn.id,
        result.txn.amount + '',
        contract,
        undefined,
        // No need to set the user id, we'll use the contract creator id
        undefined,
        contract.slug,
        contract.question
      )
    }
  }

  return { userId: user.id, message: 'success' }
})
