import { getFunctionUrl } from 'web/lib/firebase/api-call'

export const checkoutURL = (
  userId: string,
  manticDollarQuantity: number,
  referer = ''
) => {
  const endpoint = getFunctionUrl('createcheckoutsession')
  return `${endpoint}?userId=${userId}&manticDollarQuantity=${manticDollarQuantity}&referer=${encodeURIComponent(
    referer
  )}`
}
