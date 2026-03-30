import * as crypto from 'crypto'
import { Request, Response } from 'express'

import { getPrivateUser, getUser, log } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { trackPublicEvent } from 'shared/analytics'
import { APIError } from 'common/api/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import {
  CRYPTO_MANA_PER_DOLLAR,
  CRYPTO_FIRST_PURCHASE_BONUS_PCT,
  CRYPTO_BULK_PURCHASE_BONUS_PCT,
  CRYPTO_BULK_THRESHOLD_INTERNAL,
} from 'common/economy'

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

  const pg = createSupabaseDirectClient()
  const paidInCents = Math.round(usdcAmount * 100)

  let success = false
  let alreadyProcessed = false
  let finalManaAmount = 0
  let bonusAmount = 0
  let isFirstCryptoPurchase = false
  let isBulkPurchase = false

  try {
    await pg.tx(async (tx) => {
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

      log('Processing Daimo crypto payment:', {
        userId,
        usdcAmount,
        baseAmount,
        bonusAmount,
        finalManaAmount,
        bonusPct,
        isFirstCryptoPurchase,
        isBulkPurchase,
        sessionId,
        eventId,
      })

      const insertResult = await tx.oneOrNone(
        `INSERT INTO crypto_payment_intents (intent_id, user_id, mana_amount, usdc_amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (intent_id) DO NOTHING
         RETURNING id`,
        [sessionId, userId, finalManaAmount, usdcAmount]
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
          bonusPct,
          isFirstCryptoPurchase,
          isBulkPurchase,
        },
        description: 'Deposit for mana purchase via crypto',
      } as const

      await runTxnInBetQueue(tx, manaPurchaseTxn)
      await updateUser(tx, userId, {
        purchasedMana: true,
      })
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
