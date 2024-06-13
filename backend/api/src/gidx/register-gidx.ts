import { APIError, APIHandler } from 'api/helpers/endpoint'
import * as crypto from 'crypto'
import { getIp } from 'shared/analytics'
import { getPrivateUserSupabase } from 'shared/utils'
import { getPhoneNumber } from 'shared/helpers/get-phone-number'
const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerRegistration'

export const registerGIDX: APIHandler<'register-gidx'> = async (
  props,
  auth,
  req
) => {
  const MerchantCustomerID = auth.uid
  const { Latitude, Longitude, Radius, Altitude, Speed, DateTime, ...rest } =
    props
  const gps = {
    Latitude,
    Longitude,
    Radius,
    Altitude,
    Speed,
    DateTime,
  }
  const ip = getIp(req)
  const user = await getPrivateUserSupabase(auth.uid)
  if (!user) {
    throw new APIError(404, 'Private user not found')
  }
  if (!user.email) {
    throw new APIError(400, 'User must have an email address')
  }
  const phoneNumber = await getPhoneNumber(auth.uid)
  if (!phoneNumber) {
    throw new APIError(400, 'User must have a phone number')
  }
  const standardParams = getStandardParams(ip, gps)
  const body = {
    MerchantCustomerID,
    EmailAddress: user.email,
    MobilePhoneNumber: phoneNumber,
    ...standardParams,
    ...rest,
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  console.log(res)
  if (!res.ok) {
    throw new APIError(400, 'GIDX registration failed')
  }
  return { status: 'success' }
}

const getStandardParams = (ip: string, gps: gpsData) => {
  return {
    ApiKey: '',
    MerchantId: '',
    ProductTypeId: '',
    DeviceTypeId: '',
    ActivityTypeId: '',
    MerchantSessionId: crypto.randomUUID(),
    DeviceIpAdress: ip,
    DeviceGPS: gps,
  }
}

type gpsData = {
  Latitude: number
  Longitude: number
  Radius: number
  Altitude: number
  Speed: number
  DateTime: string
}
