import * as functions from 'firebase-functions'
import Stripe from 'stripe'

import { payUser } from './resolve-market'

const stripe = new Stripe(functions.config().stripe.apikey, {
  apiVersion: '2020-08-27',
  typescript: true,
})

const manticDollarStripePrice = {
  500: 'price_1K8W10GdoFKoCJW7KWORLec1',
}

export const createCheckoutSession = functions
  .runWith({ minInstances: 1 })
  .https.onRequest(async (req, res) => {
    const userId = req.query.userId?.toString()
    const manticDollarQuantity =
      req.query.manticDollarQuantity?.toString() || '500'

    if (!userId) {
      res.send('Invalid user ID')
      return
    }

    const referrer = req.headers.referer || 'https://mantic.markets'

    const session = await stripe.checkout.sessions.create({
      metadata: {
        userId,
        manticDollarQuantity,
      },
      line_items: [
        {
          price: manticDollarStripePrice[500],
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${referrer}/?success=true`,
      cancel_url: `${referrer}/?success=false`,
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
      issueMoneys(session)
    }

    res.status(200)
  })

const issueMoneys = async (session: any) => {
  const { userId, manticDollarQuantity } = session.metadata
  const payout = Number.parseInt(manticDollarQuantity)

  return await payUser([userId, payout])
}
