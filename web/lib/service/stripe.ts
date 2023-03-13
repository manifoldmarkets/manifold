import { getApiUrl } from 'common/api'

export const checkoutURL = (
  userId: string,
  manticDollarQuantity: number,
  referer = ''
) => {
  const endpoint = getApiUrl('createcheckoutsession')
  return `${endpoint}?userId=${userId}&manticDollarQuantity=${manticDollarQuantity}&referer=${encodeURIComponent(
    referer
  )}`
}
