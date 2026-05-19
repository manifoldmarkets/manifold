import { getApiUrl } from 'common/api/utils'

export const checkoutURL = (
  userId: string,
  priceInDollars: number,
  referer = '',
  offerId?: string
) => {
  const endpoint = getApiUrl('createcheckoutsession')
  const params = new URLSearchParams({
    userId,
    priceInDollars: String(priceInDollars),
    referer,
  })
  if (offerId) params.set('offerId', offerId)
  return `${endpoint}?${params.toString()}`
}
