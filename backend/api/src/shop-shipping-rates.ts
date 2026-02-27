import { APIError, type APIHandler } from './helpers/endpoint'
import { SHOP_ITEMS } from 'common/shop/items'

const PRINTFUL_API_URL = 'https://api.printful.com'

export const shopShippingRates: APIHandler<'shop-shipping-rates'> = async (
  { variantId, address },
  auth
) => {
  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  // Validate that the variantId belongs to a Manifold shop item
  // Prevents using our Printful API key as a proxy for arbitrary products
  const isValidVariant = SHOP_ITEMS.some((item) =>
    item.variants?.some((v) => v.printfulSyncVariantId === variantId)
  )
  if (!isValidVariant) {
    throw new APIError(400, 'Invalid variant ID')
  }

  const printfulToken = process.env.PRINTFUL_API_TOKEN
  if (!printfulToken) {
    throw new APIError(500, 'Printful API not configured')
  }

  // Call Printful shipping rates API
  const response = await fetch(`${PRINTFUL_API_URL}/shipping/rates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${printfulToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: {
        address1: address.address1,
        city: address.city,
        state_code: address.state || undefined,
        country_code: address.country,
        zip: address.zip,
      },
      items: [
        {
          external_variant_id: variantId,
          quantity: 1,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Printful shipping rates error:', response.status, errorText)
    try {
      const errorJson = JSON.parse(errorText)
      const message = errorJson.result || errorJson.error?.message || errorText
      throw new APIError(400, `Printful: ${message}`)
    } catch (e) {
      if (e instanceof APIError) throw e
      throw new APIError(
        400,
        `Failed to get shipping rates: ${errorText.slice(0, 200)}`
      )
    }
  }

  const data = await response.json()
  const rates = data.result || []

  return {
    rates: rates.map((rate: any) => ({
      id: rate.id,
      name: rate.name,
      rate: rate.rate,
      currency: rate.currency,
      minDeliveryDays: rate.minDeliveryDays,
      maxDeliveryDays: rate.maxDeliveryDays,
    })),
  }
}
