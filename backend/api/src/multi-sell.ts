import { APIError, type APIHandler } from './helpers/endpoint'



export const multiSell: APIHandler<'multi-sell'> = async (props, auth) => {
  throw new APIError(500, 'This endpoint is disabled.')
}
