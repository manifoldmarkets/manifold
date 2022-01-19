import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import Stripe from 'stripe'

import { payUser } from './utils'

export type StripeTransaction = {
  userId: string
  manticDollarQuantity: number
  sessionId: string
  session: any
  timestamp: number
}

const stripe = new Stripe(functions.config().stripe.apikey, {
  apiVersion: '2020-08-27',
  typescript: true,
})

// manage at https://dashboard.stripe.com/test/products?active=true
const manticDollarStripePrice =
  admin.instanceId().app.options.projectId === 'mantic-markets'
    ? {
        500: 'price_1KFQXcGdoFKoCJW770gTNBrm',
        1000: 'price_1KFQp1GdoFKoCJW7Iu0dsF65',
        2500: 'price_1KFQqNGdoFKoCJW7SDvrSaEB',
        10000: 'price_1KFQraGdoFKoCJW77I4XCwM3',
      }
    : {
        500: 'price_1K8W10GdoFKoCJW7KWORLec1',
        1000: 'price_1K8bC1GdoFKoCJW76k3g5MJk',
        2500: 'price_1K8bDSGdoFKoCJW7avAwpV0e',
        10000: 'price_1K8bEiGdoFKoCJW7Us4UkRHE',
      }

export const createCheckoutSession = functions
  .runWith({ minInstances: 1 })
  .https.onRequest(async (req, res) => {
    const userId = req.query.userId?.toString()

    const manticDollarQuantity = req.query.manticDollarQuantity?.toString()

    if (!userId) {
      res.status(400).send('Invalid user ID')
      return
    }

    if (
      !manticDollarQuantity ||
      !Object.keys(manticDollarStripePrice).includes(manticDollarQuantity)
    ) {
      res.status(400).send('Invalid Mantic Dollar quantity')
      return
    }

    const referrer =
      req.query.referer || req.headers.referer || 'https://mantic.markets'

    const session = await stripe.checkout.sessions.create({
      metadata: {
        userId,
        manticDollarQuantity,
      },
      line_items: [
        {
          price:
            manticDollarStripePrice[
              manticDollarQuantity as unknown as keyof typeof manticDollarStripePrice
            ],
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${referrer}?funding-success`,
      cancel_url: `${referrer}?funding-failiure`,
    })

    res.redirect(303, session.url || '')
  })

export const stripeWebhook = functions
  .runWith({ minInstances: 1 })
  .https.onRequest(async (req, res) => {
    let event

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'] as string,
        functions.config().stripe.webhooksecret
      )
    } catch (e: any) {
      console.log(`Webhook Error: ${e.message}`)
      res.status(400).send(`Webhook Error: ${e.message}`)
      return
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any
      await issueMoneys(session)
    }

    res.status(200).send('success')
  })

const issueMoneys = async (session: any) => {
  const { id: sessionId } = session

  const query = await firestore
    .collection('stripe-transactions')
    .where('sessionId', '==', sessionId)
    .get()

  if (!query.empty) {
    console.log('session', sessionId, 'already processed')
    return
  }

  const { userId, manticDollarQuantity } = session.metadata
  const payout = Number.parseInt(manticDollarQuantity)

  const transaction: StripeTransaction = {
    userId,
    manticDollarQuantity: payout, // save as number
    sessionId,
    session,
    timestamp: Date.now(),
  }

  await firestore.collection('stripe-transactions').add(transaction)

  await payUser(userId, payout, true)

  console.log('user', userId, 'paid M$', payout)
}

const firestore = admin.firestore()
