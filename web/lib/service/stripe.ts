import { PROJECT_ID } from 'common/envs/constants'

export const checkoutURL = (
  userId: string,
  manticDollarQuantity: number,
  referer = ''
) => {
  const endpoint = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/createCheckoutSession`

  return `${endpoint}?userId=${userId}&manticDollarQuantity=${manticDollarQuantity}&referer=${encodeURIComponent(
    referer
  )}`
}
