import { isProd } from '../firebase/init'

export const checkoutURL = (
  userId: string,
  manticDollarQuantity: number,
  referer = ''
) => {
  const endpoint = isProd
    ? 'https://us-central1-mantic-markets.cloudfunctions.net/createCheckoutSession'
    : 'https://us-central1-dev-mantic-markets.cloudfunctions.net/createCheckoutSession'

  return `${endpoint}?userId=${userId}&manticDollarQuantity=${manticDollarQuantity}&referer=${referer}`
}
