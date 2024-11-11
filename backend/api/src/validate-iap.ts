import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { z } from 'zod'
import { getPrivateUser, getUser, isProd, log } from 'shared/utils'
import { trackPublicEvent } from 'shared/analytics'
import * as admin from 'firebase-admin'
import { IapTransaction, PurchaseData } from 'common/iap'
import { ManaPurchaseTxn } from 'common/txn'
import { sendThankYouEmail } from 'shared/emails'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { IOS_PRICES } from 'common/economy'

const bodySchema = z
  .object({
    receipt: z.string(),
  })
  .strict()

const IAP_TYPES_PROCESSED = 'apple'

export const validateiap = authEndpoint(async (req, auth) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const iap = require('@flat/in-app-purchase')
  const { receipt } = validate(bodySchema, req.body)
  const userId = auth.uid

  iap.config({
    test: !isProd(), // For Apple and Google Play to force Sandbox validation only
    verbose: true, // Output debug logs to stdout stream
  })
  await iap.setup().catch((error: any) => {
    log('Error setting up iap', error)
    throw new APIError(500, 'iap setup failed')
  })

  const validatedData = await iap.validate(receipt).catch((error: any) => {
    log('error on validate data:', error)
    throw new APIError(500, 'iap receipt validation failed')
  })

  log('validated data, sandbox:', validatedData.sandbox)
  if (isProd() && validatedData.sandbox) {
    // Apple wants a successful response even if the receipt is from the sandbox,
    // so we just return success here and don't transfer any mana.
    return { success: true }
  }

  const options = {
    ignoreCanceled: true, // Apple ONLY (for now...): purchaseData will NOT contain canceled items
    ignoreExpired: true, // purchaseData will NOT contain expired subscription items
  }
  // validatedData contains sandbox: true/false for Apple and Amazon
  const purchaseData = iap.getPurchaseData(
    validatedData,
    options
  ) as PurchaseData[]
  log('purchase data:', purchaseData)

  const { transactionId, productId, purchaseDateMs, quantity } = purchaseData[0]

  const query = await firestore
    .collection('iaps')
    .where('transactionId', '==', transactionId)
    .get()

  if (!query.empty) {
    log('transactionId', transactionId, 'already processed')
    throw new APIError(403, 'iap transaction already processed')
  }
  const priceData = IOS_PRICES.find((p) => p.sku === productId)
  if (!priceData) {
    log('productId', productId, 'not found in price data')
    throw new APIError(400, 'productId not found in price data')
  }

  const user = await getUser(userId)
  if (!user) throw new APIError(500, 'Your account was not found')

  const { priceInDollars, bonusInDollars } = priceData
  const manaPayout = priceData.mana * quantity
  const revenue = priceData.priceInDollars * quantity * 0.7 // Apple takes 30%

  log('payout', manaPayout)
  const iapTransRef = firestore.collection('iaps').doc()
  const iapTransaction: IapTransaction = {
    userId,
    manaQuantity: manaPayout,
    bonusInDollars: bonusInDollars * quantity,
    paidInDollars: priceInDollars * quantity,
    createdTime: Date.now(),
    purchaseTime: purchaseDateMs,
    transactionId,
    quantity,
    receipt,
    productId,
    type: IAP_TYPES_PROCESSED,
    revenue,
    id: iapTransRef.id,
  }
  log('iap transaction:', iapTransaction)
  await firestore.collection('iaps').doc(iapTransRef.id).set(iapTransaction)

  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: manaPayout,
    token: 'M$',
    category: 'MANA_PURCHASE',
    data: {
      iapTransactionId: iapTransRef.id,
      type: IAP_TYPES_PROCESSED,
      paidInCents: priceInDollars * 100 * quantity,
    },
    description: `Deposit M$${manaPayout} from BANK for mana purchase`,
  } as Omit<ManaPurchaseTxn, 'id' | 'createdTime'>

  const isBonusEligible = user.sweepstakesVerified

  const bonusPurchaseTxn =
    isBonusEligible && bonusInDollars
      ? ({
          fromId: 'EXTERNAL',
          fromType: 'BANK',
          toId: userId,
          toType: 'USER',
          amount: bonusInDollars,
          token: 'CASH',
          category: 'CASH_BONUS',
          data: {
            iapTransactionId: iapTransRef.id,
            type: IAP_TYPES_PROCESSED,
            paidInCents: priceInDollars * 100 * quantity,
          },
          description: `Deposit ${bonusInDollars} mana cash from BANK for mana purchase bonus`,
        } as const)
      : null

  const pg = createSupabaseDirectClient()
  // TODO: retry transactions on failure!
  await pg
    .tx(async (tx) => {
      await runTxnInBetQueue(tx, manaPurchaseTxn)
      if (bonusPurchaseTxn) {
        await runTxnInBetQueue(tx, bonusPurchaseTxn)
      }
    })
    .catch((e) => {
      log.error('Error paying user from iap receipt', e)
      throw new APIError(500, 'Error running transaction')
    })

  log('user', userId, 'paid M$', manaPayout)

  const privateUser = await getPrivateUser(userId)
  if (!privateUser) throw new APIError(500, 'Private user not found')

  await sendThankYouEmail(user, privateUser)
  log('iap revenue', revenue)
  await trackPublicEvent(
    userId,
    'M$ purchase',
    { amount: manaPayout, transactionId },
    { revenue }
  )
  return { success: true }
})

const firestore = admin.firestore()
