import * as crypto from 'crypto'
import { APIError } from 'common/api/utils'
import { GIDXCustomerProfile } from 'common/gidx/gidx'
import { getPrivateUserSupabase } from 'shared/utils'
import { getPhoneNumber } from 'shared/helpers/get-phone-number'

export const getGIDXStandardParams = () => ({
  // TODO: before merging into main, switch from sandbox key to production key in prod
  ApiKey: process.env.GIDX_API_KEY,
  MerchantID: process.env.GIDX_MERCHANT_ID,
  ProductTypeID: process.env.GIDX_PRODUCT_TYPE_ID,
  DeviceTypeID: process.env.GIDX_DEVICE_TYPE_ID,
  ActivityTypeID: process.env.GIDX_ACTIVITY_TYPE_ID,
  MerchantSessionID: crypto.randomUUID(),
})

export const getGIDXCustomerProfile = async (userId: string) => {
  const ENDPOINT =
    'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerProfile'
  const body = {
    ...getGIDXStandardParams(),
    MerchantCustomerID: userId,
  } as Record<string, string>
  const queryParams = new URLSearchParams(body).toString()
  const urlWithParams = `${ENDPOINT}?${queryParams}`

  const res = await fetch(urlWithParams)
  if (!res.ok) {
    throw new APIError(400, 'GIDX verification session failed')
  }
  return (await res.json()) as GIDXCustomerProfile
}

export const getUserRegistrationRequirements = async (userId: string) => {
  const user = await getPrivateUserSupabase(userId)
  if (!user) {
    throw new APIError(404, 'Private user not found')
  }
  if (!user.email) {
    throw new APIError(400, 'User must have an email address')
  }
  const phoneNumberWithCode = await getPhoneNumber(userId)
  if (!phoneNumberWithCode) {
    throw new APIError(400, 'User must have a phone number')
  }
  return { user, phoneNumberWithCode }
}
