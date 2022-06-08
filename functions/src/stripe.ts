import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import Stripe from 'stripe'

import { getPrivateUser, getUser, isProd, payUser } from './utils'
import { sendThankYouEmail } from './emails'

export type StripeSession = Stripe.Event.Data.Object & {
  id: string
  metadata: {
    userId: string
    manticDollarQuantity: string
  }
}

export type StripeTransaction = {
  userId: string
  manticDollarQuantity: number
  sessionId: string
  session: StripeSession
  timestamp: number
}

const initStripe = () => {
  const apiKey = process.env.STRIPE_APIKEY as string
  return new Stripe(apiKey, { apiVersion: '2020-08-27', typescript: true })
}

// manage at https://dashboard.stripe.com/test/products?active=true
const manticDollarStripePrice = isProd
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
  .runWith({ minInstances: 1, secrets: ['STRIPE_APIKEY'] })
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
      req.query.referer || req.headers.referer || 'https://manifold.markets'

    const stripe = initStripe()
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
  .runWith({
    minInstances: 1,
    secrets: ['MAILGUN_KEY', 'STRIPE_APIKEY', 'STRIPE_WEBHOOKSECRET'],
  })
  .https.onRequest(async (req, res) => {
    const stripe = initStripe()
    let event

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'] as string,
        process.env.STRIPE_WEBHOOKSECRET as string
      )
    } catch (e: any) {
      console.log(`Webhook Error: ${e.message}`)
      res.status(400).send(`Webhook Error: ${e.message}`)
      return
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as StripeSession
      await issueMoneys(session)
    }

    res.status(200).send('success')
  })

const issueMoneys = async (session: StripeSession) => {
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

  const user = await getUser(userId)
  if (!user) return

  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  await sendThankYouEmail(user, privateUser)
}

const firestore = admin.firestore()
