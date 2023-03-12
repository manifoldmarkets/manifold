import * as admin from 'firebase-admin'
import Stripe from 'stripe'
import { Request, Response } from 'express'

import { getPrivateUser, getUser, isProd, payUsers } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { track } from 'shared/analytics'

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
const manticDollarStripePrice = isProd()
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

export const createcheckoutsession = async (req: Request, res: Response) => {
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
}

export const stripewebhook = async (req: Request, res: Response) => {
  const stripe = initStripe()
  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
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
}

const issueMoneys = async (session: StripeSession) => {
  const { id: sessionId } = session
  const { userId, manticDollarQuantity } = session.metadata
  const deposit = Number.parseInt(manticDollarQuantity)

  const success = await firestore.runTransaction(async (trans) => {
    const query = await trans.get(
      firestore
        .collection('stripe-transactions')
        .where('sessionId', '==', sessionId)
    )
    if (!query.empty) {
      console.log('session', sessionId, 'already processed')
      return false
    }
    const stripeDoc = firestore.collection('stripe-transactions').doc()
    trans.set(stripeDoc, {
      userId,
      manticDollarQuantity: deposit, // save as number
      sessionId,
      session,
      timestamp: Date.now(),
    })
    payUsers(trans, [{ userId, payout: deposit, deposit }])
    return true
  })

  if (success) {
    console.log('user', userId, 'paid M$', deposit)

    const user = await getUser(userId)
    if (!user) return

    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return

    await sendThankYouEmail(user, privateUser)

    await track(
      userId,
      'M$ purchase',
      { amount: deposit, sessionId },
      { revenue: deposit / 100 }
    )
  }
}

const firestore = admin.firestore()
