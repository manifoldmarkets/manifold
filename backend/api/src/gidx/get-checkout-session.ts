import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  CheckoutSession,
  CheckoutSessionResponse,
  CustomerProfileResponse,
} from 'common/gidx/gidx'
import {
  GIDXCallbackUrl,
  GIDX_BASE_URL,
  getGIDXStandardParams,
  getLocalServerIP,
  throwIfIPNotWhitelisted,
  verifyReasonCodes,
} from 'shared/gidx/helpers'
import { getIp } from 'shared/analytics'
import { log } from 'shared/monitoring/log'
import { randomBytes } from 'crypto'
import { TWOMBA_CASHOUT_ENABLED, TWOMBA_ENABLED } from 'common/envs/constants'
import { getUserAndPrivateUserOrThrow, LOCAL_DEV } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getVerificationStatus } from 'common/gidx/user'
import { WEB_PRICES } from 'common/economy'

const ENDPOINT = GIDX_BASE_URL + '/v3.0/api/DirectCashier/CreateSession'

export const getCheckoutSession: APIHandler<
  'get-checkout-session-gidx'
> = async (props, auth, req) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  if (!TWOMBA_CASHOUT_ENABLED && props.PayActionCode === 'PAYOUT') {
    throw new APIError(400, 'Cashouts will be enabled soon!')
  }
  const pg = createSupabaseDirectClient()
  const userId = auth.uid
  const userAndPrivateUser = await getUserAndPrivateUserOrThrow(userId, pg)
  const { user, privateUser } = userAndPrivateUser

  const MerchantTransactionID = randomString(16)
  const MerchantOrderID = randomString(16)
  const body = {
    ...props,
    DeviceIpAddress: LOCAL_DEV ? await getLocalServerIP() : getIp(req),
    MerchantCustomerID: userId,
    MerchantOrderID,
    MerchantTransactionID,
    CallbackURL: GIDXCallbackUrl + '/payment-callback-gidx',
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
    PaymentMethods,
    PaymentMethodSettings,
    ResponseMessage,
    ResponseCode,
  } = data
  throwIfIPNotWhitelisted(ResponseCode, ResponseMessage)
  log('Checkout session response:', data)

  const { status, message } = await verifyReasonCodes(
    userAndPrivateUser,
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
    GIDX_BASE_URL + '/v3.0/api/CustomerIdentity/CustomerProfile'
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
  log(
    'Customer profile response:',
    CustomerProfile.MerchantCustomerID,
    CustomerProfile.ReasonCodes
  )
  if (props.PayActionCode === 'PAYOUT') {
    const { status, message } = getVerificationStatus(user, privateUser)
    if (status !== 'success') {
      return {
        status,
        message,
      }
    }
  }
  const PaymentAmounts = WEB_PRICES
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

const randomString = (length: number): string => {
  return randomBytes(length).toString('hex').slice(0, length)
}
