import * as admin from 'firebase-admin'
import Stripe from 'stripe'
import { Request, Response } from 'express'

import {
  BOOST_CONTRACT_SUBSIDY_MANA,
  BOOST_PAYMENT_TYPE,
  BOOST_PURCHASE_EVENT_NAMES,
  contractBoostAddsSubsidy,
} from 'common/boost'
import { getPrivateUser, getUser, isProd, log } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { trackPublicEvent } from 'shared/analytics'
import { APIError } from 'common/api/utils'
import { addHouseSubsidy } from 'shared/helpers/add-house-subsidy'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { recordManaPurchase } from 'shared/supabase/users'
import { STRIPE_PAYMENTS_ENABLED } from 'common/envs/constants'
import { WEB_PRICES } from 'common/economy'
import { isUserBanned } from 'common/ban-utils'
import { getActiveUserBans } from './helpers/rate-limit'
import { getContract } from 'shared/utils'
import { boostContractImmediately } from 'shared/supabase/contracts'
import { getPost } from 'shared/supabase/posts'
import { boostPostImmediately } from './purchase-boost'
import {
  OFFER_MANA_AMOUNT,
  OFFER_PRICE_STRIPE,
  PAYMENT_PENDING_LOCK_MINUTES,
} from 'common/personalized-mana-offer'
import { getOrCreateStripePromotionCodeForOffer } from './helpers/stripe-offer-promotion-code'

// Stripe Price ID for the "20% off 5K mana" personalized-offer SKU ($50
// base). The Coupon referenced by STRIPE_20_OFF_5K_COUPON_ID must be
// restricted to the matching Stripe Product (`applies_to.products`) so the
// per-offer promotion codes can't cross-apply to standard mana tier purchases.
const OFFER_STRIPE_PRICE_ID = () => {
  const id = process.env.STRIPE_20_OFF_5K_PRICE_ID
  if (!id) {
    throw new Error(
      'STRIPE_20_OFF_5K_PRICE_ID not configured — create a $50 Price on the ' +
        'personalized-mana-sale Product in Stripe Dashboard and set this env var.'
    )
  }
  return id
}

export type StripeSession = Stripe.Event.Data.Object & {
  id: string
  metadata: {
    userId: string
    priceInDollars?: string
    boostId?: string
    contractId?: string
    postId?: string
    offerId?: string
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
  if (!STRIPE_PAYMENTS_ENABLED) {
    res.status(400).send('Stripe payments are currently disabled')
    return
  }

  const userId = req.query.userId?.toString()
  const offerId = req.query.offerId?.toString()
  const priceInDollars = req.query.priceInDollars?.toString()

  if (!userId) {
    res.status(400).send('Invalid user ID')
    return
  }

  const user = await getUser(userId)
  if (!user) {
    res.status(404).send('User not found')
    return
  }
  const bans = await getActiveUserBans(userId)
  if (isUserBanned(bans, 'purchase')) {
    res.status(403).send('Your account is restricted from purchasing mana.')
    return
  }

  const referrer =
    req.query.referer || req.headers.referer || 'https://manifold.markets'

  const stripe = initStripe()

  if (offerId) {
    const pg = createSupabaseDirectClient()

    // Atomically: verify the offer is redeemable + claim the cross-method
    // pending lock if no other payment session is already in flight for this
    // offer. The lock is shared with create-daimo-session so a user can't
    // start a Stripe session for an offer that already has a Daimo session
    // in flight (or vice versa).
    const offer = await pg.oneOrNone<{
      id: string
      status: string
      expires_at: string | null
      payment_pending_at: string | null
    }>(
      `update personalized_mana_offers
          set payment_pending_session_id = 'pending-' || gen_random_uuid()::text,
              payment_pending_at = now()
        where id = $1
          and user_id = $2
          and status = 'active'
          and expires_at > now()
          and (
            payment_pending_at is null
            or payment_pending_at < now() - ($3 || ' minutes')::interval
          )
       returning id, status, expires_at, payment_pending_at`,
      [offerId, userId, String(PAYMENT_PENDING_LOCK_MINUTES)]
    )

    if (!offer) {
      // Either the offer doesn't exist, is no longer redeemable, or a recent
      // payment session is already in flight. Tell the user clearly so the
      // frontend can render a "checkout in progress" banner instead of a
      // silent failure.
      const existing = await pg.oneOrNone<{
        status: string
        expires_at: string | null
        payment_pending_at: string | null
      }>(
        `select status, expires_at, payment_pending_at
           from personalized_mana_offers
          where id = $1 and user_id = $2`,
        [offerId, userId]
      )
      if (
        existing &&
        existing.payment_pending_at &&
        new Date(existing.payment_pending_at).getTime() >
          Date.now() - PAYMENT_PENDING_LOCK_MINUTES * 60 * 1000
      ) {
        res
          .status(409)
          .send(
            'A checkout for this offer is already in progress. Complete or close it first.'
          )
        return
      }
      res.status(400).send('Offer not redeemable')
      return
    }

    // Per-offer Stripe Promotion Code (max_redemptions=1) so Stripe enforces
    // single-use at payment time. If the same user starts a second checkout
    // session for this offer (e.g. by reloading) they share this code and
    // Stripe rejects the second redemption attempt.
    let promotionCodeId: string
    try {
      promotionCodeId = await getOrCreateStripePromotionCodeForOffer(offerId)
    } catch (e: unknown) {
      // Roll back the pending lock so the user can retry — the Stripe API
      // call failed, which is on us, not them.
      await pg.none(
        `update personalized_mana_offers
            set payment_pending_session_id = null,
                payment_pending_at = null
          where id = $1`,
        [offerId]
      )
      console.error('Failed to create Stripe promotion code:', e)
      res.status(500).send('Failed to start personalized offer checkout')
      return
    }

    // Cap Stripe Checkout TTL at offer + 1h. The SQL redemption grace runs
    // 2h past offer, leaving a 1h buffer for webhook latency between Stripe
    // session expiry and SQL grace expiry. Stripe constraints: min 30 min,
    // max 24 h.
    const STRIPE_MIN_FUTURE_MS = 31 * 60 * 1000
    const STRIPE_MAX_FUTURE_MS = 24 * 60 * 60 * 1000
    const STRIPE_SESSION_PAST_OFFER_MS = 60 * 60 * 1000
    const offerExpiryMs =
      new Date(offer.expires_at!).getTime() + STRIPE_SESSION_PAST_OFFER_MS
    const stripeExpiresAt = Math.floor(
      Math.min(
        Math.max(offerExpiryMs, Date.now() + STRIPE_MIN_FUTURE_MS),
        Date.now() + STRIPE_MAX_FUTURE_MS
      ) / 1000
    )

    const session = await stripe.checkout.sessions.create({
      metadata: {
        userId,
        offerId,
        priceInDollars: String(OFFER_PRICE_STRIPE),
      },
      line_items: [
        {
          // Pre-configured $50 Stripe Product/Price for the personalized-sale
          // SKU. The Coupon attached via the promotion code below applies a
          // 20% discount, and Stripe restricts the Coupon to this Product so
          // the code can't be cross-applied to standard mana tier purchases.
          price: OFFER_STRIPE_PRICE_ID(),
          quantity: 1,
        },
      ],
      mode: 'payment',
      expires_at: stripeExpiresAt,
      discounts: [{ promotion_code: promotionCodeId }],
      success_url: `${referrer}?purchaseSuccess=true`,
      cancel_url: `${referrer}?purchaseSuccess=false`,
    })

    res.redirect(303, session.url || '')
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

  const session = await stripe.checkout.sessions.create({
    metadata: {
      userId,
      priceInDollars: String(price.priceInDollars),
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
  if (!STRIPE_PAYMENTS_ENABLED) {
    res.status(400).send('Stripe payments are currently disabled')
    return
  }

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
    if (
      session.metadata.boostId &&
      (session.metadata.contractId || session.metadata.postId)
    ) {
      await handleBoostPayment(session)
    } else {
      await issueMoneys(session)
    }
  }

  res.status(200).send('success')
}

const issueMoneys = async (session: StripeSession) => {
  const { id: sessionId } = session
  const { userId, priceInDollars, offerId } = session.metadata
  if (priceInDollars === undefined) {
    log('skipping session', sessionId, '; no mana amount')
    return
  }
  const price = Number.parseInt(priceInDollars)
  // For non-offer sessions deposit is the matching WEB_PRICES tier. For offer
  // sessions, the actual deposit is decided inside the tx after we attempt to
  // atomically claim the offer — if the claim fails (already redeemed,
  // expired, voided, or never existed) we fall back to standard mana at
  // `price * 100`, so the user always receives fair value for their payment.
  const tierDeposit = WEB_PRICES.find(
    (p) => p.priceInDollars === Number.parseInt(priceInDollars)
  )?.mana
  if (!offerId && !tierDeposit) {
    throw new APIError(500, 'Invalid deposit amount')
  }
  // Intended deposit recorded into firestore. The actual mana granted may
  // differ in the (rare) race where an offer claim fails — that discrepancy
  // is logged and visible by comparing this doc to the resulting MANA_PURCHASE
  // txn amount.
  const intendedDeposit = offerId ? OFFER_MANA_AMOUNT : (tierDeposit as number)
  log('priceInDollars', priceInDollars, 'offerId', offerId)

  // TODO kill firestore collection when we get off stripe. too lazy to do it now
  const fs = getFirestore()
  const id = await fs.runTransaction(async (trans) => {
    const query = await trans.get(
      fs
        .collection('stripe-transactions')
        .where('sessionId', '==', sessionId)
    )
    if (!query.empty) {
      log('session', sessionId, 'already processed')
      return false
    }
    const stripeDoc = fs.collection('stripe-transactions').doc()
    trans.set(stripeDoc, {
      userId,
      manticDollarQuantity: intendedDeposit,
      priceInDollars,
      manaDepoitAmount: intendedDeposit,
      sessionId,
      session,
      timestamp: Date.now(),
    })

    return stripeDoc.id
  })
  if (!id) return

  const pg = createSupabaseDirectClient()

  let success = false
  let deposit = intendedDeposit
  let offerClaimed = false
  let claimedOfferId: string | null = null
  try {
    await pg.tx(async (tx) => {
      if (offerId) {
        // Atomic claim: only flips the row if it's currently active and not
        // expired. WHERE clause is the dedup — at most one concurrent webhook
        // can win. Subsequent webhooks (double-tab redemption attempts, or
        // hoarded sessions after expiry/void) see rowCount=0 and fall through.
        // 2-hour grace past expiry — keep in sync with daimo-webhook.ts and
        // the expire cron. The Stripe session expires_at is offer + 1h, so
        // there's a 1h buffer for webhook latency before this grace closes.
        const claim = await tx.result(
          `update personalized_mana_offers
              set status = 'redeemed',
                  redeemed_at = now(),
                  redemption_method = 'stripe',
                  redemption_session_id = $2
            where id = $1
              and user_id = $3
              and status = 'active'
              and expires_at + interval '2 hours' > now()`,
          [offerId, sessionId, userId]
        )
        offerClaimed = (claim.rowCount ?? 0) === 1
        if (offerClaimed) {
          claimedOfferId = offerId
        } else {
          // Multi-tab fallback: the named offer was already redeemed (or
          // expired/voided), but the user might have OTHER active offers
          // and still expects offer-rate value for their $40 payment.
          // Try to claim any other active offer for this user, soonest-
          // expiring first. SKIP LOCKED so we don't deadlock with a peer
          // webhook running the same fallback.
          const fallback = await tx.oneOrNone<{ id: string }>(
            `select id from personalized_mana_offers
              where user_id = $1
                and status = 'active'
                and expires_at + interval '2 hours' > now()
              order by expires_at asc
              limit 1
              for update skip locked`,
            [userId]
          )
          if (fallback) {
            const fallbackClaim = await tx.result(
              `update personalized_mana_offers
                  set status = 'redeemed',
                      redeemed_at = now(),
                      redemption_method = 'stripe',
                      redemption_session_id = $2
                where id = $1
                  and status = 'active'`,
              [fallback.id, sessionId]
            )
            if ((fallbackClaim.rowCount ?? 0) === 1) {
              offerClaimed = true
              claimedOfferId = fallback.id
              log(
                'Stripe offer fallback claimed alternate active offer for multi-tab user',
                { originalOfferId: offerId, claimedOfferId, userId, sessionId }
              )
            }
          }
          if (!offerClaimed) {
            deposit = tierDeposit ?? price * 100
            log.warn(
              'Stripe offer not claimable + no fallback, falling back to standard rate',
              { offerId, userId, sessionId, intendedDeposit, actualDeposit: deposit }
            )
          }
        }

        // Release the pending lock if we didn't end up claiming any offer.
        // (When we DO claim, status flips to 'redeemed' and the lock is moot.)
        if (!offerClaimed) {
          await tx.none(
            `update personalized_mana_offers
                set payment_pending_session_id = null,
                    payment_pending_at = null
              where id = $1 and status = 'active'`,
            [offerId]
          )
        }
      }

      const manaPurchaseTxn = {
        fromId: 'EXTERNAL',
        fromType: 'BANK',
        toId: userId,
        toType: 'USER',
        amount: deposit,
        token: 'M$',
        category: 'MANA_PURCHASE',
        data: {
          stripeTransactionId: id,
          type: 'stripe',
          // KNOWN PRE-EXISTING BUG: this stores DOLLARS in a cents-named
          // field for Stripe rows only. Daimo and other rails store true
          // cents. Admin consumers (admin-get-mana-sales.ts,
          // admin-get-top-whale-users.ts) compensate by multiplying Stripe
          // rows by 100. Don't change this without backfilling historical
          // txns and updating those consumers in lockstep.
          paidInCents: price,
          ...(offerClaimed
            ? { offerId: claimedOfferId, personalizedOffer: true }
            : {}),
        },
        description: offerClaimed
          ? 'Personalized mana sale (Stripe)'
          : `Deposit for mana purchase`,
      } as const

      await runTxnInBetQueue(tx, manaPurchaseTxn)

      // Mark the purchaser and unlock bonus eligibility (matches the crypto
      // rail). See recordManaPurchase for the monotonic promotion rule.
      await recordManaPurchase(tx, userId)
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

const handleBoostPayment = async (session: StripeSession) => {
  const { boostId, contractId, postId, userId } = session.metadata
  if (!boostId || (!contractId && !postId) || !userId) {
    log.error('Invalid boost payment metadata', session.metadata)
    throw new APIError(400, 'Invalid boost payment metadata')
  }

  const pg = createSupabaseDirectClient()

  const { boost, wasJustFunded } = await pg.tx(async (tx) => {
    const updatedBoost = await tx.oneOrNone(
      `update contract_boosts 
         set funded = true 
         where id = $1 and user_id = $2 and (
           (contract_id = $3 and post_id is null) or 
           (post_id = $4 and contract_id is null)
         )
         and not funded
         returning *`,
      [boostId, userId, contractId ?? null, postId ?? null]
    )
    if (updatedBoost) return { boost: updatedBoost, wasJustFunded: true }

    const existingBoost = await tx.oneOrNone(
      `select *
       from contract_boosts
       where id = $1 and user_id = $2 and (
         (contract_id = $3 and post_id is null) or
         (post_id = $4 and contract_id is null)
       )`,
      [boostId, userId, contractId ?? null, postId ?? null]
    )
    if (!existingBoost) {
      throw new APIError(404, 'Boost not found')
    }
    return { boost: existingBoost, wasJustFunded: false }
  })

  if (!wasJustFunded) return

  let contract
  if (contractId) {
    contract = await getContract(pg, contractId)
    if (!contract) throw new APIError(404, 'Contract not found')
    if (contractBoostAddsSubsidy(contract)) {
      await addHouseSubsidy(contractId, BOOST_CONTRACT_SUBSIDY_MANA)
    }
  }

  if (new Date(boost.start_time) <= new Date()) {
    if (contract) {
      await boostContractImmediately(pg, contract)
    }
    if (postId) {
      const post = await getPost(pg, postId)
      if (!post) throw new APIError(404, 'Post not found')
      await boostPostImmediately(pg, post)
    }
  }

  await trackPublicEvent(
    userId,
    BOOST_PURCHASE_EVENT_NAMES[contractId ? 'contract' : 'post'],
    {
      contractId,
      postId,
      boostId,
      paymentMethod: BOOST_PAYMENT_TYPE.CASH,
    }
  )
}

const getFirestore = () => admin.firestore()
