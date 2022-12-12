import * as functions from 'firebase-functions'
import { Order } from 'common/order'
import { log } from 'functions/src/utils'
import { APIError } from 'common/api'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import * as admin from 'firebase-admin'
import {
  getUnfilledBetsAndUserBalances,
  handleBet,
} from 'functions/src/place-bet'
const firestore = admin.firestore()

export const onCreateOrder = functions.firestore
  .document('contracts/{contractId}/orders/{orderId}')
  .onCreate(async (change, context) => {
    const order = change.data() as Order
    if (!order.isFilled || order.isCancelled) return
    await handleOrder(order)
  })

const handleOrder = async (latestOrder: Order) => {
  const { contractId, userId } = latestOrder
  const result = await firestore.runTransaction(async (trans) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await trans.get(contractDoc)

    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')

    const contract = contractSnap.data() as Contract

    const { closeTime, outcomeType, mechanism, collectedFees, volume } =
      contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed.')
    if (
      (outcomeType !== 'BINARY' && outcomeType !== 'PSEUDO_NUMERIC') ||
      mechanism !== 'cpmm-1'
    )
      throw new APIError(400, 'Invalid contract type.')

    const { unfilledBets, balanceByUserId } =
      await getUnfilledBetsAndUserBalances(trans, contractDoc)

    // get a list of all the orders that are not filled and not cancelled
    const orders = (
      await trans.get(
        firestore
          .collection(`contracts/${contractId}/orders`)
          .where('isFilled', '==', false)
          .where('isCancelled', '==', false)
          .orderBy('createdTime', 'asc')
      )
    ).docs.map((doc) => doc.data() as Order)

    const ordersToCancel = [] as Order[]
    // go through the orders by earliest created time and create bets if the users have sufficient balances
    for (const order of orders) {
      const { outcome, amount, userId } = order
      // get user
      const userDoc = firestore.doc(`users/${userId}`)
      const userSnap = await trans.get(userDoc)
      if (!userSnap.exists) continue
      const user = userSnap.data() as User
      if (user.balance < amount) {
        ordersToCancel.push(order)
        continue
      }
      // otherwise, create a bet
      await handleBet(amount, contractId, outcome, userId)
    }
    await Promise.all(
      ordersToCancel.map((order) =>
        trans.update(
          firestore.doc(`contracts/${contractId}/orders/${order.id}`),
          { isCancelled: true }
        )
      )
    )
  })

  log(`Main transaction finished - auth ${userId}.`)

  return result
}
