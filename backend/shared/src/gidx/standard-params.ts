import * as crypto from 'crypto'

export const getGIDXStandardParams = () => ({
  // TODO: before merging into main, switch from sandbox key to production key in prod
  ApiKey: process.env.GIDX_API_KEY,
  MerchantID: process.env.GIDX_MERCHANT_ID,
  ProductTypeID: process.env.GIDX_PRODUCT_TYPE_ID,
  DeviceTypeID: process.env.GIDX_DEVICE_TYPE_ID,
  ActivityTypeID: process.env.GIDX_ACTIVITY_TYPE_ID,
  MerchantSessionID: crypto.randomUUID(),
})
