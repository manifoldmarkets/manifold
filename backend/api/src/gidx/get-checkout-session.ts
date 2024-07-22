import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  CheckoutSession,
  CheckoutSessionResponse,
  CustomerProfileResponse,
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
    MerchantSessionID,
    CashierLimits,
    PaymentAmounts,
    PaymentMethods,
    PaymentMethodSettings,
  } = data
  log('Checkout session response:', data)

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
  const ID_ENDPOINT =
    'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerProfile'
  const idBody = {
    MerchantCustomerID: userId,
    ...getGIDXStandardParams(),
  } as Record<string, string>
  const queryParams = new URLSearchParams(idBody).toString()
  const urlWithParams = `${ID_ENDPOINT}?${queryParams}`
  const idRes = await fetch(urlWithParams)
  if (!idRes.ok) {
    throw new APIError(400, 'GIDX customer profile failed')
  }
  const CustomerProfile = (await idRes.json()) as CustomerProfileResponse
  log('Customer profile response:', CustomerProfile)

  return {
    status,
    message,
    session: {
      MerchantSessionID,
      MerchantTransactionID,
      CashierLimits,
      PaymentAmounts,
      PaymentMethods,
      PaymentMethodSettings,
      CustomerProfile: {
        Address: CustomerProfile.Address.find((a) => a.Primary),
        Name: CustomerProfile.Name.find((n) => n.Primary),
      },
    } as CheckoutSession,
  }
}
