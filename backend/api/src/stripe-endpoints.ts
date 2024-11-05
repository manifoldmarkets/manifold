import * as admin from 'firebase-admin'
import Stripe from 'stripe'
import { Request, Response } from 'express'

import { getPrivateUser, getUser, isProd, log } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { trackPublicEvent } from 'shared/analytics'
import { APIError } from 'common/api/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { WEB_PRICES } from 'common/economy'

export type StripeSession = Stripe.Event.Data.Object & {
  id: string
  metadata: {
    userId: string
    priceInDollars: string
  }
}

export type StripeTransaction = {
  userId: string
  manticDollarQuantity: number
  manaDepositAmount?: number
  priceInDollars?: number
  sessionId: string
  session: StripeSession
  timestamp: number
}

const initStripe = () => {
  const apiKey = process.env.STRIPE_APIKEY as string
  return new Stripe(apiKey, { apiVersion: '2020-08-27', typescript: true })
}

export const createcheckoutsession = async (req: Request, res: Response) => {
  const userId = req.query.userId?.toString()

  const priceInDollars = req.query.priceInDollars?.toString()

  if (!userId) {
    res.status(400).send('Invalid user ID')
    return
  }
  if (!priceInDollars) {
    res.status(400).send('Must specify manifold price in dollars')
    return
  }
  const price = WEB_PRICES.find(
    (p) => p.priceInDollars === Number.parseInt(priceInDollars)
  )
  if (!price || !price.devStripeId || !price.prodStripeId) {
    res.status(400).send('Invalid price in dollars')
    return
  }
  const priceId = isProd() ? price.prodStripeId : price.devStripeId

  const referrer =
    req.query.referer || req.headers.referer || 'https://manifold.markets'

  const stripe = initStripe()
  const session = await stripe.checkout.sessions.create({
    metadata: {
      userId,
      priceInDollars: price.priceInDollars,
    },
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'payment',
    allow_promotion_codes: true,
    success_url: `${referrer}?purchaseSuccess=true`,
    cancel_url: `${referrer}?purchaseSuccess=false`,
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
    log(`Webhook Error: ${e.message}`)
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
  const { userId, priceInDollars } = session.metadata
  if (priceInDollars === undefined) {
    log('skipping session', sessionId, '; no mana amount')
    return
  }
  const price = Number.parseInt(priceInDollars)
  const deposit = WEB_PRICES.find(
    (p) => p.priceInDollars === Number.parseInt(priceInDollars)
  )?.mana
  if (!deposit) {
    throw new APIError(500, 'Invalid deposit amount')
  }
  log('priceInDollars', priceInDollars, 'deposit', deposit)

  // TODO kill firestore collection when we get off stripe. too lazy to do it now
  const id = await firestore.runTransaction(async (trans) => {
    const query = await trans.get(
      firestore
        .collection('stripe-transactions')
        .where('sessionId', '==', sessionId)
    )
    if (!query.empty) {
      log('session', sessionId, 'already processed')
      return false
    }
    const stripeDoc = firestore.collection('stripe-transactions').doc()
    trans.set(stripeDoc, {
      userId,
      manticDollarQuantity: deposit,
      priceInDollars,
      manaDepoitAmount: deposit,
      sessionId,
      session,
      timestamp: Date.now(),
    })

    return stripeDoc.id
  })
  if (!id) return

  const pg = createSupabaseDirectClient()

  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: deposit,
    token: 'M$',
    category: 'MANA_PURCHASE',
    data: { stripeTransactionId: id, type: 'stripe', paidInCents: price },
    description: `Deposit for mana purchase`,
  } as const

  let success = false
  try {
    await pg.tx(async (tx) => {
      await runTxnInBetQueue(tx, manaPurchaseTxn)
      await updateUser(tx, userId, {
        purchasedMana: true,
      })
    })
    success = true
  } catch (e) {
    log.error(
      'Must reconcile stripe-transactions with purchase txns. User may not have received mana!'
    )
    if (e instanceof APIError) {
      log.error('APIError in runTxn: ' + e.message)
    }
    log.error('Unknown error in runTxnFromBank' + e)
  }

  if (success) {
    log('user', userId, 'paid M$', deposit)
    const user = await getUser(userId)
    if (!user) {
      throw new APIError(500, 'User not found')
    }

    const privateUser = await getPrivateUser(userId)
    if (!privateUser) throw new APIError(500, 'Private user not found')

    await sendThankYouEmail(user, privateUser)
    log('stripe revenue', price)

    await trackPublicEvent(
      userId,
      'M$ purchase',
      { amount: deposit, sessionId, priceInDollars },
      { revenue: price }
    )
  }
}

const firestore = admin.firestore()
