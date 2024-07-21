import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  CheckoutSession,
  CheckoutSessionResponse,
  GIDX_REGISTATION_ENABLED,
} from 'common/gidx/gidx'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { getIp } from 'shared/analytics'
import { log } from 'shared/monitoring/log'
import { verifyReasonCodes } from 'api/gidx/register'
import * as crypto from 'crypto'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DirectCashier/CreateSession'

export const getCheckoutSession: APIHandler<
  'get-checkout-session-gidx'
> = async (props, auth, req) => {
  if (!GIDX_REGISTATION_ENABLED)
    throw new APIError(400, 'GIDX registration is disabled')
  const userId = auth.uid
  await getUserRegistrationRequirements(userId)
  const MerchantTransactionID = crypto.randomUUID()
  const MerchantOrderID = crypto.randomUUID()
  const body = {
    ...props,
    // TODO: add back in prod
    DeviceIpAddress: getIp(req),
    MerchantCustomerID: userId,
    MerchantOrderID,
    MerchantTransactionID,
    CallbackURL:
      'https://enabled-bream-sharply.ngrok-free.app/payment-callback-gidx',
    ...getGIDXStandardParams(),
  }
  log('get checkout session body:', body)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new APIError(400, 'GIDX checkout session failed')
  }
  const data = (await res.json()) as CheckoutSessionResponse
  log('Checkout session response:', data)
  const {
    ReasonCodes,
    CashierLimits,
    PaymentAmounts,
    PaymentMethods,
    PaymentMethodSettings,
  } = data
  const { status, message } = await verifyReasonCodes(
    auth.uid,
    ReasonCodes,
    undefined,
    undefined
  )
  if (status === 'error') {
    return {
      status,
      message,
    }
  }

  return {
    status,
    message,
    session: {
      MerchantTransactionID,
      CashierLimits,
      PaymentAmounts,
      PaymentMethods,
      PaymentMethodSettings,
    } as CheckoutSession,
  }
}
