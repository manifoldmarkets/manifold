import { APIHandler } from './helpers/endpoint'

export const getShopItemCounts: APIHandler<
  'get-shop-item-counts'
> = async () => {
  return { counts: {} }
}
