import * as crypto from 'crypto'
import { Request, Response } from 'express'

import { getPrivateUser, getUser, log } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { trackPublicEvent } from 'shared/analytics'
import { APIError } from 'common/api/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { recordManaPurchase } from 'shared/supabase/users'
import {
  CRYPTO_MANA_PER_DOLLAR,
  CRYPTO_FIRST_PURCHASE_BONUS_PCT,
  CRYPTO_BULK_PURCHASE_BONUS_PCT,
  CRYPTO_BULK_THRESHOLD_INTERNAL,
} from 'common/economy'
import {
  OFFER_MANA_AMOUNT,
  OFFER_PRICE_CRYPTO,
} from 'common/personalized-mana-offer'

const TIMESTAMP_TOLERANCE_SEC = 300 // 5 minutes

type DaimoWebhookEvent = {
  id: string
  type: 'session.processing' | 'session.succeeded' | 'session.bounced'
  createdAt: number
  isTestEvent?: boolean
  data: {
    session: {
      sessionId: string
      status: string
      destination: {
        type: string
        address: string
        chainId: number
        chainName: string
        tokenAddress: string
        tokenSymbol: string
        amountUnits?: string
        delivery?: {
          txHash: string
          receivedUnits: string
        }
      }
      display: {
        title: string
        verb: string
      }
      paymentMethod: {
        type: string
        receiverAddress?: string
        createdAt: number
      } | null
      metadata: Record<string, string> | null
      createdAt: number
      expiresAt: number
    }
  }
}

function verifyWebhookSignature(
  secret: string,
  signatureHeader: string,
  rawBody: string
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...v] = p.split('=')
      return [k, v.join('=')]
    })
  )
  const ts = parts['t']
  const sig = parts['v1']
  if (!ts || !sig) return false

  const tsNum = parseInt(ts, 10)
  if (isNaN(tsNum)) return false
  const age = Math.abs(Math.floor(Date.now() / 1000) - tsNum)
  if (age > TIMESTAMP_TOLERANCE_SEC) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    return false
  }
}

export const daimowebhook = async (req: Request, res: Response) => {
  const webhookSecret = process.env.DAIMO_WEBHOOK_SECRET

  if (!webhookSecret) {
    log.error('DAIMO_WEBHOOK_SECRET not configured')
    res.status(500).send('Webhook not configured')
    return
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body)

  const signatureHeader = req.headers['daimo-signature'] as string | undefined
  if (!signatureHeader) {
    log('Daimo webhook missing signature header')
    res.status(401).send('Missing signature')
    return
  }

  if (!verifyWebhookSignature(webhookSecret, signatureHeader, rawBody)) {
    log('Daimo webhook signature verification failed')
    res.status(401).send('Invalid signature')
    return
  }

  let event: DaimoWebhookEvent
  try {
    event = JSON.parse(rawBody) as DaimoWebhookEvent
  } catch (e) {
    log.error('Failed to parse Daimo webhook body', { error: e })
    res.status(400).send('Invalid request body')
    return
  }

  log('Daimo webhook received:', {
    eventId: event.id,
    type: event.type,
    sessionId: event.data?.session?.sessionId,
    isTestEvent: event.isTestEvent,
  })

  if (event.isTestEvent) {
    log('Ignoring test event:', event.id)
    res.status(200).send('test event acknowledged')
    return
  }

  if (event.type === 'session.processing') {
    log('Ignoring session.processing event:', event.id)
    res.status(200).send('processing event acknowledged')
    return
  }

  if (event.type === 'session.bounced') {
    log.warn('Daimo session bounced:', {
      eventId: event.id,
      sessionId: event.data?.session?.sessionId,
      userId: event.data?.session?.metadata?.userId,
    })
    res.status(200).send('bounced event acknowledged')
    return
  }

  if (event.type === 'session.succeeded') {
    try {
      await handleSessionSucceeded(event)
    } catch (e) {
      log.error('Error processing session.succeeded', { error: e })
    }
  }

  res.status(200).send('success')
}

const handleSessionSucceeded = async (event: DaimoWebhookEvent) => {
  const { session } = event.data
  const eventId = event.id
  const sessionId = session.sessionId

  if (!sessionId) {
    log.error('Missing sessionId in webhook event', { eventId })
    return
  }

  const userId = session.metadata?.userId
  if (!userId) {
    log.error('Missing userId in session metadata', { eventId, sessionId })
    return
  }

  const delivery = session.destination?.delivery
  if (!delivery?.receivedUnits) {
    log.error('Missing delivery amount in succeeded session', {
      eventId,
      sessionId,
    })
    return
  }

  const usdcAmount = Number(delivery.receivedUnits)
  if (usdcAmount <= 0 || isNaN(usdcAmount)) {
    log.error('Invalid USDC amount', {
      receivedUnits: delivery.receivedUnits,
      eventId,
      sessionId,
    })
    return
  }

  const offerId = session.metadata?.offerId

  const pg = createSupabaseDirectClient()
  const paidInCents = Math.round(usdcAmount * 100)

  let success = false
  let alreadyProcessed = false
  let finalManaAmount = 0
  let bonusAmount = 0
  let isFirstCryptoPurchase = false
  let isBulkPurchase = false
  let offerRedeemed = false

  try {
    await pg.tx(async (tx) => {
      // If this session is tied to a personalized offer, redeem it at the fixed
      // rate (M5,000 flat, no purchase bonuses). Lock the offer row to prevent
      // double-spend across concurrent webhook deliveries.
      if (offerId) {
        const offer = await tx.oneOrNone<{
          status: string
          expires_at: string | null
        }>(
          `select status, expires_at
             from personalized_mana_offers
            where id = $1 and user_id = $2
            for update`,
          [offerId, userId]
        )
        // Eligibility:
        //  - Status still active (cron may flip past-expiry offers to expired)
        //  - Within a 2-hour grace past expires_at — long enough to cover
        //    any payment provider session (Stripe ~1h post-offer, Daimo ~1h
        //    server-side) plus generous webhook latency buffer. Users never
        //    accidentally pay full price when the offer was active at
        //    session start: the session itself expires before this grace.
        //  - Paid amount close to $35. Daimo's `destination.amountUnits` is
        //    supposed to enforce exactly $35, but we double-check so any
        //    enforcement gap can't silently consume the offer at the flat rate
        const OFFER_EXPIRY_GRACE_MS = 2 * 60 * 60 * 1000
        const eligible =
          offer &&
          offer.status === 'active' &&
          offer.expires_at &&
          new Date(offer.expires_at).getTime() + OFFER_EXPIRY_GRACE_MS >=
            Date.now() &&
          usdcAmount >= OFFER_PRICE_CRYPTO - 0.01 &&
          usdcAmount <= OFFER_PRICE_CRYPTO + 0.1

        if (eligible) {
          // Atomic claim with the same belt-and-suspenders the Stripe path
          // uses: lock by id + user_id + status='active'. We assert rowCount=1
          // so any future refactor that defeats the FOR UPDATE lock surfaces
          // as a loud error rather than silently double-granting mana.
          const claim = await tx.result(
            `update personalized_mana_offers
                set status = 'redeemed',
                    redeemed_at = now(),
                    redemption_method = 'crypto',
                    redemption_session_id = $2
              where id = $1
                and user_id = $3
                and status = 'active'`,
            [offerId, sessionId, userId]
          )

          if ((claim.rowCount ?? 0) === 1) {
            finalManaAmount = OFFER_MANA_AMOUNT
            bonusAmount = 0
            isFirstCryptoPurchase = false
            isBulkPurchase = false
            offerRedeemed = true
          } else {
            // Multi-tab fallback (matches Stripe behavior): try to claim any
            // OTHER active offer for this user — they paid $35 USDC expecting
            // offer rate, so honor it from a different stack if one's free.
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
                        redemption_method = 'crypto',
                        redemption_session_id = $2
                  where id = $1
                    and status = 'active'`,
                [fallback.id, sessionId]
              )
              if ((fallbackClaim.rowCount ?? 0) === 1) {
                finalManaAmount = OFFER_MANA_AMOUNT
                bonusAmount = 0
                isFirstCryptoPurchase = false
                isBulkPurchase = false
                offerRedeemed = true
                log(
                  'Daimo offer fallback claimed alternate active offer for multi-tab user',
                  { originalOfferId: offerId, claimedOfferId: fallback.id, userId, sessionId }
                )
              }
            }
            if (!offerRedeemed) {
              log.warn(
                'Daimo offer UPDATE returned 0 rows + no fallback offer available; falling through to standard rate',
                { offerId, userId, sessionId }
              )
            }
          }
        } else if (offer) {
          log.warn(
            'Daimo offer redemption: offer not eligible at delivery time, falling through to standard rate',
            {
              offerId,
              userId,
              status: offer.status,
              usdcAmount,
              required: OFFER_PRICE_CRYPTO,
            }
          )
        }

        // If we didn't end up claiming the offer, release the pending lock so
        // the user can retry. (Successful claims flip status to 'redeemed',
        // which makes the lock moot.)
        if (!offerRedeemed) {
          await tx.none(
            `update personalized_mana_offers
                set payment_pending_session_id = null,
                    payment_pending_at = null
              where id = $1 and status = 'active'`,
            [offerId]
          )
        }
      }

      if (!offerRedeemed) {
        const existingPurchase = await tx.oneOrNone<{ count: string }>(
          `SELECT COUNT(*) as count FROM crypto_payment_intents WHERE user_id = $1`,
          [userId]
        )
        isFirstCryptoPurchase =
          !existingPurchase || parseInt(existingPurchase.count) === 0

        isBulkPurchase = usdcAmount >= CRYPTO_BULK_THRESHOLD_INTERNAL

        let bonusPct = 0
        if (isFirstCryptoPurchase) bonusPct += CRYPTO_FIRST_PURCHASE_BONUS_PCT
        if (isBulkPurchase) bonusPct += CRYPTO_BULK_PURCHASE_BONUS_PCT

        const baseAmount = Math.floor(usdcAmount * CRYPTO_MANA_PER_DOLLAR)
        bonusAmount = Math.floor(baseAmount * bonusPct)
        finalManaAmount = baseAmount + bonusAmount
      }

      log('Processing Daimo crypto payment:', {
        userId,
        usdcAmount,
        finalManaAmount,
        bonusAmount,
        isFirstCryptoPurchase,
        isBulkPurchase,
        offerRedeemed,
        offerId,
        sessionId,
        eventId,
      })

      const insertResult = await tx.oneOrNone(
        `INSERT INTO crypto_payment_intents (intent_id, user_id, mana_amount, usdc_amount, offer_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (intent_id) DO NOTHING
         RETURNING id`,
        [
          sessionId,
          userId,
          finalManaAmount,
          usdcAmount,
          offerRedeemed ? offerId : null,
        ]
      )
      if (!insertResult) {
        alreadyProcessed = true
        return
      }

      const manaPurchaseTxn = {
        fromId: 'EXTERNAL',
        fromType: 'BANK',
        toId: userId,
        toType: 'USER',
        amount: finalManaAmount,
        token: 'M$',
        category: 'MANA_PURCHASE',
        data: {
          daimoSessionId: sessionId,
          daimoEventId: eventId,
          daimoTxHash: delivery.txHash,
          type: 'crypto',
          paidInCents,
          bonusAmount,
          isFirstCryptoPurchase,
          isBulkPurchase,
          ...(offerRedeemed ? { offerId, personalizedOffer: true } : {}),
        },
        description: offerRedeemed
          ? 'Personalized mana sale (crypto)'
          : 'Deposit for mana purchase via crypto',
      } as const

      await runTxnInBetQueue(tx, manaPurchaseTxn)

      // Mark the purchaser and unlock bonus eligibility (matches the Stripe
      // rail). See recordManaPurchase for the monotonic promotion rule.
      await recordManaPurchase(tx, userId)
    })
    success = true
  } catch (e) {
    log.error(
      'Must reconcile crypto_payment_intents with purchase txns. User may not have received mana!',
      { error: e, sessionId, eventId }
    )
    if (e instanceof APIError) {
      log.error('APIError in runTxn', { message: e.message })
    }
    throw e
  }

  if (alreadyProcessed) {
    log('Session already processed (duplicate delivery):', { sessionId, eventId })
    return
  }

  if (success) {
    log('Crypto payment processed:', userId, 'M$', finalManaAmount, {
      bonusAmount,
      isFirstCryptoPurchase,
      isBulkPurchase,
      sessionId,
    })

    const user = await getUser(userId)
    if (!user) {
      log.error('User not found for thank you email', { userId })
      return
    }

    const privateUser = await getPrivateUser(userId)
    if (!privateUser) {
      log.error('Private user not found for thank you email', { userId })
      return
    }

    await sendThankYouEmail(user, privateUser)

    await trackPublicEvent(
      userId,
      'M$ purchase',
      {
        amount: finalManaAmount,
        bonusAmount,
        isFirstCryptoPurchase,
        isBulkPurchase,
        sessionId,
        eventId,
        usdcAmount,
      },
      { revenue: usdcAmount }
    )
  }
}
