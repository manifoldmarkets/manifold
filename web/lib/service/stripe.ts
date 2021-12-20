export const checkoutURL = (
  userId: string,
  manticDollarQuantity: number,
  referer = ''
) => {
  const endpoint =
    'https://us-central1-mantic-markets.cloudfunctions.net/createCheckoutSession'

  return `${endpoint}?userId=${userId}&manticDollarQuantity=${manticDollarQuantity}&referer=${referer}`
}
