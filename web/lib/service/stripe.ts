import { getApiUrl } from 'common/api/utils'

export const checkoutURL = (
  userId: string,
  priceInDollars: number,
  referer = ''
) => {
  const endpoint = getApiUrl('createcheckoutsession')
  return `${endpoint}?userId=${userId}&priceInDollars=${priceInDollars}&referer=${encodeURIComponent(
    referer
  )}`
}
