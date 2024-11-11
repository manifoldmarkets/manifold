import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  PaymentAmount,
  REFERRAL_MIN_PURCHASE_DOLLARS,
  WEB_PRICES,
} from 'common/economy'
import {
  CompleteSessionDirectCashierResponse,
  ProcessSessionCode,
} from 'common/gidx/gidx'
import { introductoryTimeWindow, User } from 'common/user'
import { getIp, track, trackPublicEvent } from 'shared/analytics'
import { distributeReferralBonusIfNoneGiven } from 'shared/distribute-referral-bonus'
import {
  getGIDXStandardParams,
  getLocalServerIP,
  getUserRegistrationRequirements,
  GIDX_BASE_URL,
} from 'shared/gidx/helpers'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getReferrerInfo, updateUser } from 'shared/supabase/users'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getUser, LOCAL_DEV } from 'shared/utils'

const ENDPOINT = GIDX_BASE_URL + '/v3.0/api/DirectCashier/CompleteSession'

const getPaymentAmountForWebPriceDollars = (priceInDollars: number) => {
  const amount = WEB_PRICES.find(
    (p) =>
      p.priceInDollars === priceInDollars && !p.devStripeId && !p.prodStripeId
  )
  if (!amount) {
    throw new APIError(400, 'Invalid price')
  }
  return amount
}

export const completeCheckoutSession: APIHandler<
  'complete-checkout-session-gidx'
> = async (props, auth, req) => {
  const userId = auth.uid
  const user = await getUser(userId)
  if (!user) throw new APIError(500, 'Your account was not found')

  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
  } = props
  const paymentAmount = getPaymentAmountForWebPriceDollars(
    PaymentAmount.priceInDollars
  )

  if (paymentAmount.newUsersOnly) {
    if (Date.now() > introductoryTimeWindow(user))
      throw new APIError(403, 'New user purchase discount no longer offered.')
    if (user.purchasedSweepcash)
      throw new APIError(403, 'New user purchase discount only available once.')
  }

  const { creditCard, Type, BillingAddress, NameOnAccount, SavePaymentMethod } =
    PaymentMethod
  if (Type === 'CC' && !creditCard) {
    throw new APIError(400, 'Must include credit card information')
  }
  const body = {
    PaymentAmount: {
      PaymentAmount: PaymentAmount.priceInDollars,
      BonusAmount: 0,
    },
    DeviceIpAddress: LOCAL_DEV ? await getLocalServerIP() : getIp(req),
    MerchantTransactionID,
    SavePaymentMethod,
    PaymentMethod: {
      Type,
      NameOnAccount,
      ...creditCard,
      PhoneNumber: phoneNumberWithCode,
      BillingAddress,
    },
    ...getGIDXStandardParams(MerchantSessionID),
  }
  const {
    PaymentMethod: {
      CardNumber: _,
      ExpirationDate: __,
      CVV: ___,
      ...paymentMethodWithoutCCInfo
    },
    ...bodyWithoutPaymentMethod
  } = body
  const bodyToLog = {
    ...bodyWithoutPaymentMethod,
    PaymentMethod: paymentMethodWithoutCCInfo,
  }
  log('Complete checkout session body:', bodyToLog)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    track(auth.uid, 'gidx complete checkout session', {
      status: 'error',
      message: 'GIDX error',
    })
    throw new APIError(400, 'GIDX complete checkout session failed')
  }
  const data = (await res.json()) as CompleteSessionDirectCashierResponse
  log('Complete checkout session response:', data)
  const {
    SessionStatusCode,
    AllowRetry,
    PaymentDetails,
    SessionStatusMessage,
    ResponseCode,
    SessionID,
  } = data
  if (ResponseCode >= 300) {
    track(auth.uid, 'gidx complete checkout session', {
      status: 'error',
      message: 'GIDX error',
      gidxMessage: SessionStatusMessage,
    })
    return {
      status: 'error',
      message: 'GIDX error',
      gidxMessage: SessionStatusMessage,
    }
  }
  const { status, message, gidxMessage } = ProcessSessionCode(
    SessionStatusCode,
    SessionStatusMessage,
    AllowRetry
  )
  track(auth.uid, 'gidx complete checkout session', {
    status,
    message,
    gidxMessage,
  })
  if (status !== 'success') {
    return { status, message, gidxMessage }
  }

  const {
    PaymentStatusCode,
    PaymentStatusMessage,
    PaymentAmount: CompletedPaymentAmount,
  } = PaymentDetails[0]
  if (CompletedPaymentAmount !== PaymentAmount.priceInDollars) {
    log.error('Payment amount mismatch', {
      CompletedPaymentAmount,
      PaymentAmount,
    })
  }
  if (PaymentStatusCode === '1') {
    await sendCoins(
      user,
      paymentAmount,
      CompletedPaymentAmount * 100,
      MerchantTransactionID,
      SessionID,
      user.sweepstakesVerified ?? false
    )
    return {
      status: 'success',
      message: 'Payment successful',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '2') {
    return {
      status: 'error',
      message: 'Payment ineligible',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '3') {
    return {
      status: 'error',
      message: 'Payment failed, check your card information.',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '4') {
    return {
      status: 'pending',
      message: 'Payment processing',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '5') {
    return {
      status: 'error',
      message: 'Payment reversed',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '6') {
    return {
      status: 'error',
      message: 'Payment canceled',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '0') {
    return {
      status: 'pending',
      message: 'Payment pending',
      gidxMessage: PaymentStatusMessage,
    }
  }

  return {
    status: 'error',
    message: 'Unknown payment status',
  }
}

const sendCoins = async (
  user: User,
  amount: PaymentAmount,
  paidInCents: number,
  transactionId: string,
  sessionId: string,
  isSweepsVerified: boolean
) => {
  const userId = user.id
  const data = { transactionId, type: 'gidx', paidInCents, sessionId }
  const pg = createSupabaseDirectClient()
  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    data,
    amount: amount.mana,
    token: 'M$',
    category: 'MANA_PURCHASE',
    description: `Deposit for mana purchase`,
  } as const

  const cashBonusTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    data,
    amount: amount.bonusInDollars,
    token: 'CASH',
    category: 'CASH_BONUS',
    description: `Free sweepcash bonus for purchasing mana.`,
  } as const

  const referrerInfo = user.usedReferralCode
    ? await getReferrerInfo(pg, user.referredByUserId)
    : undefined
  await pg.tx(async (tx) => {
    await runTxnInBetQueue(tx, manaPurchaseTxn)
    if (isSweepsVerified) {
      await runTxnInBetQueue(tx, cashBonusTxn)
    }
    await updateUser(tx, userId, {
      purchasedMana: true,
      purchasedSweepcash: isSweepsVerified,
    })
    if (referrerInfo && paidInCents / 100 >= REFERRAL_MIN_PURCHASE_DOLLARS) {
      await distributeReferralBonusIfNoneGiven(
        tx,
        user,
        referrerInfo.id,
        referrerInfo.sweepsVerified
      )
    }
  })

  await trackPublicEvent(user.id, 'M$ purchase', {
    amount: amount.mana,
    priceInDollars: amount.priceInDollars,
    bonusInDollars: amount.bonusInDollars,
    transactionId,
    sessionId,
    source: 'gidx',
  })
}
