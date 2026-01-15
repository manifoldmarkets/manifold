import { Request, Response } from 'express'

import { getPrivateUser, getUser, log } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { trackPublicEvent } from 'shared/analytics'
import { APIError } from 'common/api/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { CRYPTO_MANA_PER_DOLLAR } from 'common/economy'

// Daimo Pay webhook event types
type DaimoWebhookEvent = {
  type:
    | 'payment_started'
    | 'payment_completed'
    | 'payment_bounced'
    | 'payment_refunded'
  payment: {
    intentAddr: string
    destFinalCallTokenAmount?: string // Amount in token units (USDC has 6 decimals)
    destChainId?: number
    destTokenAddr?: string
    [key: string]: unknown
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

  log('Daimo webhook received:', event.type, event.payment?.intentAddr)

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

const handlePaymentCompleted = async (payment: DaimoWebhookEvent['payment']) => {
  const { intentAddr, destFinalCallTokenAmount } = payment

  if (!intentAddr) {
    log.error('Missing intentAddr in payment')
    return
  }

  const pg = createSupabaseDirectClient()

  // Look up the user from the stored payment intent
  const paymentIntent = await pg.oneOrNone(
    `SELECT user_id, processed FROM crypto_payment_intents 
     WHERE intent_id = $1`,
    [intentAddr]
  )

  if (!paymentIntent) {
    log.error('Payment intent not found', { intentAddr })
    return
  }

  if (paymentIntent.processed) {
    log('Payment already processed:', intentAddr)
    return
  }

  const userId = paymentIntent.user_id

  // Parse the USDC amount (6 decimals)
  // destFinalCallTokenAmount is in the smallest unit (e.g., "1000000" = 1 USDC)
  const usdcAmount = destFinalCallTokenAmount
    ? Number(destFinalCallTokenAmount) / 1_000_000
    : 0

  if (usdcAmount <= 0) {
    log.error('Invalid USDC amount', { destFinalCallTokenAmount })
    return
  }

  // Calculate mana amount (100 mana per $1 USDC)
  const manaAmount = Math.floor(usdcAmount * CRYPTO_MANA_PER_DOLLAR)
  const paidInCents = Math.round(usdcAmount * 100)

  log('Processing crypto payment:', { userId, usdcAmount, manaAmount, intentAddr })

  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: manaAmount,
    token: 'M$',
    category: 'MANA_PURCHASE',
    data: {
      daimoIntentId: intentAddr,
      type: 'crypto',
      paidInCents,
    },
    description: 'Deposit for mana purchase via crypto',
  } as const

  let success = false
  try {
    await pg.tx(async (tx) => {
      // Mark payment as processed first (idempotency)
      const updated = await tx.result(
        `UPDATE crypto_payment_intents 
         SET processed = true, processed_at = NOW(), mana_amount = $2, usdc_amount = $3
         WHERE intent_id = $1 AND processed = false`,
        [intentAddr, manaAmount, usdcAmount]
      )

      if (updated.rowCount === 0) {
        // Already processed by another request
        throw new Error('Payment already processed')
      }

      await runTxnInBetQueue(tx, manaPurchaseTxn)
      await updateUser(tx, userId, {
        purchasedMana: true,
      })
    })
    success = true
  } catch (e) {
    if (e instanceof Error && e.message === 'Payment already processed') {
      log('Payment already processed (concurrent request):', intentAddr)
      return
    }
    log.error(
      'Must reconcile crypto_payment_intents with purchase txns. User may not have received mana!',
      { error: e }
    )
    if (e instanceof APIError) {
      log.error('APIError in runTxn', { message: e.message })
    }
    throw e
  }

  if (success) {
    log('Crypto payment processed:', userId, 'M$', manaAmount)

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
      { amount: manaAmount, intentAddr, usdcAmount },
      { revenue: usdcAmount }
    )
  }
}
