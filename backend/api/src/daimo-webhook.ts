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

// Daimo Pay webhook event types (based on actual payload structure)
type DaimoWebhookEvent = {
  type:
    | 'payment_started'
    | 'payment_completed'
    | 'payment_bounced'
    | 'payment_refunded'
  paymentId: string
  chainId?: number
  txHash?: string
  payment: {
    id: string
    status: string
    createdAt: string
    display?: {
      intent: string
      paymentValue: string
      currency: string
    }
    source?: {
      payerAddress: string
      txHash: string
      chainId: string
      amountUnits: string // Amount in USDC (e.g., "1" = $1 USDC)
      tokenSymbol: string
      tokenAddress: string
    }
    destination?: {
      destinationAddress: string
      txHash: string
      chainId: string
      amountUnits: string // Amount in USDC (e.g., "1" = $1 USDC)
      tokenSymbol: string
      tokenAddress: string
      callData: string
    }
    externalId?: string | null
    metadata?: {
      userId?: string
      [key: string]: unknown
    }
  }
}

export const daimowebhook = async (req: Request, res: Response) => {
  // Verify Basic auth
  const authHeader = req.headers.authorization
  const expectedToken = process.env.DAIMO_WEBHOOK_SECRET

  if (!expectedToken) {
    log.error('DAIMO_WEBHOOK_SECRET not configured')
    res.status(500).send('Webhook not configured')
    return
  }

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    log('Webhook missing or invalid auth header')
    res.status(401).send('Unauthorized')
    return
  }

  const providedToken = authHeader.replace('Basic ', '')
  if (providedToken !== expectedToken) {
    log('Webhook auth token mismatch')
    res.status(401).send('Unauthorized')
    return
  }

  let event: DaimoWebhookEvent
  try {
    event = req.body as DaimoWebhookEvent
  } catch (e) {
    log.error('Failed to parse webhook body', { error: e })
    res.status(400).send('Invalid request body')
    return
  }

  log('Daimo webhook received:', event.type, event.paymentId)

  // Only process completed payments
  if (event.type === 'payment_completed') {
    try {
      await handlePaymentCompleted(event.payment)
    } catch (e) {
      log.error('Error processing payment', { error: e })
      // Still return 200 to prevent retries for non-recoverable errors
      // Log the error for manual investigation
    }
  }

  res.status(200).send('success')
}

const handlePaymentCompleted = async (
  payment: DaimoWebhookEvent['payment']
) => {
  const paymentId = payment.id

  if (!paymentId) {
    log.error('Missing payment id')
    return
  }

  // Get userId from metadata (sent by frontend)
  const userId = payment.metadata?.userId
  if (!userId) {
    log.error('Missing userId in payment metadata', { paymentId })
    return
  }

  const pg = createSupabaseDirectClient()

  // Parse the USDC amount - amountUnits is already in USDC (e.g., "1" = $1 USDC)
  const amountUnits = payment.destination?.amountUnits
  const usdcAmount = amountUnits ? Number(amountUnits) : 0

  if (usdcAmount <= 0) {
    log.error('Invalid USDC amount', { amountUnits, paymentId })
    return
  }

  const paidInCents = Math.round(usdcAmount * 100)

  let success = false
  let alreadyProcessed = false
  let finalManaAmount = 0
  let bonusAmount = 0
  let isFirstCryptoPurchase = false
  let isBulkPurchase = false

  try {
    await pg.tx(async (tx) => {
      // Check if this is the user's first crypto purchase (before inserting new record)
      const existingPurchase = await tx.oneOrNone<{ count: string }>(
        `SELECT COUNT(*) as count FROM crypto_payment_intents WHERE user_id = $1`,
        [userId]
      )
      isFirstCryptoPurchase = !existingPurchase || parseInt(existingPurchase.count) === 0

      // Check if this qualifies for bulk purchase bonus (>= $995 to cover fees, advertised as $1000)
      isBulkPurchase = usdcAmount >= CRYPTO_BULK_THRESHOLD_INTERNAL

      // Calculate bonus percentage
      let bonusPct = 0
      if (isFirstCryptoPurchase) bonusPct += CRYPTO_FIRST_PURCHASE_BONUS_PCT
      if (isBulkPurchase) bonusPct += CRYPTO_BULK_PURCHASE_BONUS_PCT

      // Calculate mana amounts
      const baseAmount = Math.floor(usdcAmount * CRYPTO_MANA_PER_DOLLAR)
      bonusAmount = Math.floor(baseAmount * bonusPct)
      finalManaAmount = baseAmount + bonusAmount

      log('Processing crypto payment:', {
        userId,
        usdcAmount,
        baseAmount,
        bonusAmount,
        finalManaAmount,
        bonusPct,
        isFirstCryptoPurchase,
        isBulkPurchase,
        paymentId,
      })

      // Insert for idempotency - skip if already processed
      const insertResult = await tx.oneOrNone(
        `INSERT INTO crypto_payment_intents (intent_id, user_id, mana_amount, usdc_amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (intent_id) DO NOTHING
         RETURNING id`,
        [paymentId, userId, finalManaAmount, usdcAmount]
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
          daimoPaymentId: paymentId,
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
      { error: e }
    )
    if (e instanceof APIError) {
      log.error('APIError in runTxn', { message: e.message })
    }
    throw e
  }

  if (alreadyProcessed) {
    log('Payment already processed (concurrent request):', paymentId)
    return
  }

  if (success) {
    log('Crypto payment processed:', userId, 'M$', finalManaAmount, {
      bonusAmount,
      isFirstCryptoPurchase,
      isBulkPurchase,
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
        paymentId,
        usdcAmount,
      },
      { revenue: usdcAmount }
    )
  }
}
