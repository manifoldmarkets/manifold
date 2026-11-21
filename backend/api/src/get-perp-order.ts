import { readPerpOrder } from 'shared/perps/orders'
import { APIHandler } from './helpers/endpoint'

export const getPerpOrder: APIHandler<'get-perp-order'> = async (
  body,
  auth
) => ({ order: await readPerpOrder(body.contractId, auth.uid, body.orderId) })
