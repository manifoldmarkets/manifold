import { SHOP_ITEMS } from 'common/shop/items'
import { APIHandler } from './helpers/endpoint'

export const getShopItems: APIHandler<'get-shop-items'> = async () => {
  return SHOP_ITEMS
}
