import { Request, Response } from 'express'

import { getPrivateUser, getUser, log } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { trackPublicEvent } from 'shared/analytics'
import { APIError } from 'common/api/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { CRYPTO_MANA_PER_DOLLAR } from 'common/economy'

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

  // Calculate mana amount (100 mana per $1 USDC)
  const manaAmount = Math.floor(usdcAmount * CRYPTO_MANA_PER_DOLLAR)
  const paidInCents = Math.round(usdcAmount * 100)

  log('Processing crypto payment:', {
    userId,
    usdcAmount,
    manaAmount,
    paymentId,
  })

  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: manaAmount,
    token: 'M$',
    category: 'MANA_PURCHASE',
    data: {
      daimoPaymentId: paymentId,
      type: 'crypto',
      paidInCents,
    },
    description: 'Deposit for mana purchase via crypto',
  } as const

  let success = false
  try {
    await pg.tx(async (tx) => {
      // Insert for idempotency - will fail if already processed
      try {
        await tx.none(
          `INSERT INTO crypto_payment_intents (intent_id, user_id, mana_amount, usdc_amount)
           VALUES ($1, $2, $3, $4)`,
          [paymentId, userId, manaAmount, usdcAmount]
        )
      } catch (e: unknown) {
        // Check if it's a unique constraint violation (already processed)
        if (
          e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as { code: string }).code === '23505'
        ) {
          throw new Error('Payment already processed')
        }
        throw e
      }

      await runTxnInBetQueue(tx, manaPurchaseTxn)
      await updateUser(tx, userId, {
        purchasedMana: true,
      })
    })
    success = true
  } catch (e) {
    if (e instanceof Error && e.message === 'Payment already processed') {
      log('Payment already processed (concurrent request):', paymentId)
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
      { amount: manaAmount, paymentId, usdcAmount },
      { revenue: usdcAmount }
    )
  }
}
