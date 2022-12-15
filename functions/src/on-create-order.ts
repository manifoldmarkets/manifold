import * as functions from 'firebase-functions'
import { Order } from '../../common/order'
import { invokeFunction, log } from './utils'
import { APIError } from '../../common/api'
import { Contract } from '../../common/contract'
import * as admin from 'firebase-admin'
import { handleBet } from './place-bet'
import { newEndpointNoAuth, validate } from './api'
import { z } from 'zod'
const firestore = admin.firestore()
const bodySchema = z.object({
  contractId: z.string(),
})
export const onCreateOrder = functions.firestore
  .document('contracts/{contractId}/orders/{orderId}')
  .onCreate(async (change) => {
    const order = change.data() as Order
    if (order.isFilled || order.isCancelled) return
    try {
      console.log(
        await invokeFunction('handleorder', { contractId: order.contractId })
      )
    } catch (e) {
      console.error(e)
    }
  })
export const handleorder = newEndpointNoAuth(
  {
    timeoutSeconds: 1000,
    memory: '8GiB',
    minInstances: 1,
  },
  async (req) => {
    const { contractId } = validate(bodySchema, req.body)
    await handleOrder(contractId)
    return { success: true }
  }
)

const handleOrder = async (contractId: string) => {
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()

  if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')

  const contract = contractSnap.data() as Contract

  const { closeTime, outcomeType, mechanism } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(400, 'Trading is closed.')
  if (
    (outcomeType !== 'BINARY' && outcomeType !== 'PSEUDO_NUMERIC') ||
    mechanism !== 'cpmm-1'
  )
    throw new APIError(400, 'Invalid contract type.')

  const result = await firestore.runTransaction(async (trans) => {
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

    log('Found orders', orders.length)
    let countProcessed = 0
    const ordersToCancel = [] as Order[]
    // go through the orders by earliest created time and create bets if the users have sufficient balances
    for (const order of orders) {
      const { outcome, amount, userId } = order
      log('Processing order', order.id)
      try {
        const { betId } = await handleBet(amount, contractId, userId, outcome)
        log(`Order ${order.id} filled by bet ${betId}`)
        trans.update(
          firestore.doc(`contracts/${contractId}/orders/${order.id}`),
          {
            isFilled: true,
            betId,
          }
        )
        countProcessed++
      } catch (e) {
        log('error placing bet from order', e)
        ordersToCancel.push(order)
      }
    }
    await Promise.all(
      ordersToCancel.map((order) =>
        trans.update(
          firestore.doc(`contracts/${contractId}/orders/${order.id}`),
          { isCancelled: true }
        )
      )
    )
    log(
      `Processed orders, ${countProcessed} filled, ${ordersToCancel.length} cancelled of total ${orders.length}`
    )
  })

  return result
}
