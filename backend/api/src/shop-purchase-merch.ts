import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxnInBetQueue, type TxnData } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { getShopItem, isMerchItem } from 'common/shop/items'
import { getBenefit } from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'

const PRINTFUL_API_URL = 'https://api.printful.com'

export const shopPurchaseMerch: APIHandler<'shop-purchase-merch'> = async (
  { itemId, variantId, shipping },
  auth
) => {
  const item = getShopItem(itemId)
  if (!item) {
    throw new APIError(404, 'Item not found')
  }

  if (!isMerchItem(item)) {
    throw new APIError(400, 'Item is not a merch item')
  }

  // Validate the variant exists for this item
  const variant = item.variants?.find((v) => v.printfulSyncVariantId === variantId)
  if (!variant) {
    throw new APIError(400, 'Invalid variant for this item')
  }

  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  const printfulToken = process.env.PRINTFUL_API_TOKEN
  if (!printfulToken) {
    throw new APIError(500, 'Printful API not configured')
  }

  const pg = createSupabaseDirectClient()

  const result = await pg.tx(async (tx) => {
    const user = await getUser(auth.uid, tx)
    if (!user) throw new APIError(401, 'Your account was not found')

    if (user.isBannedFromPosting) {
      throw new APIError(403, 'Your account is banned')
    }

    // Check one-time purchase limit (max 1 of each merch item per user)
    if (item.limit === 'one-time') {
      const existing = await tx.oneOrNone(
        `SELECT 1 FROM shop_orders WHERE user_id = $1 AND item_id = $2 LIMIT 1`,
        [auth.uid, itemId]
      )
      if (existing) {
        throw new APIError(403, 'You have already purchased this item (limit 1 per customer)')
      }
    }

    // Get supporter discount
    const entRows = await tx.manyOrNone(
      `SELECT * FROM user_entitlements WHERE user_id = $1`,
      [auth.uid]
    )
    const currentEntitlements = entRows.map(convertEntitlement)
    const shopDiscount = getBenefit(currentEntitlements, 'shopDiscount', 0)
    const price = shopDiscount > 0
      ? Math.floor(item.price * (1 - shopDiscount))
      : item.price

    // Check balance
    if (user.balance < price) {
      throw new APIError(403, 'Insufficient balance')
    }

    // Create transaction to deduct mana
    const discountPercent = Math.round(shopDiscount * 100)
    const descriptionParts = [`Purchased ${item.name} (${variant.size})`]
    if (discountPercent > 0) {
      descriptionParts.push(`(${discountPercent}% supporter discount)`)
    }
    const txnData: TxnData = {
      category: 'SHOP_PURCHASE',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: price,
      token: 'M$',
      description: descriptionParts.join(' '),
      data: { itemId, variantId, merchOrder: true, supporterDiscount: shopDiscount },
    }

    const txn = await runTxnInBetQueue(tx, txnData)

    // Create Printful order (draft mode - confirm: false)
    const printfulOrder = await createPrintfulOrder(printfulToken, {
      variantId,
      shipping,
      externalId: `manifold-${txn.id}`,
      confirm: false, // Draft order - won't be charged or produced
    })

    // Create shop_order record with Printful reference
    await tx.none(
      `INSERT INTO shop_orders (user_id, item_id, price_mana, txn_id, status, printful_order_id, printful_status)
       VALUES ($1, $2, $3, $4, 'PENDING_FULFILLMENT', $5, $6)`,
      [
        auth.uid,
        itemId,
        price,
        txn.id,
        printfulOrder.id.toString(),
        printfulOrder.status,
      ]
    )

    return {
      success: true as const,
      printfulOrderId: printfulOrder.id.toString(),
      printfulStatus: printfulOrder.status,
    }
  })

  return result
}

// Helper to create Printful order
async function createPrintfulOrder(
  token: string,
  params: {
    variantId: string
    shipping: {
      name: string
      address1: string
      address2?: string
      city: string
      state: string
      zip: string
      country: string
    }
    externalId: string
    confirm: boolean
  }
): Promise<{ id: number; status: string }> {
  const response = await fetch(`${PRINTFUL_API_URL}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_id: params.externalId,
      recipient: {
        name: params.shipping.name,
        address1: params.shipping.address1,
        address2: params.shipping.address2 || undefined,
        city: params.shipping.city,
        state_code: params.shipping.state,
        country_code: params.shipping.country,
        zip: params.shipping.zip,
      },
      items: [
        {
          // Use external_id (the hex ID shown in Printful dashboard)
          // This is the ID from the e-commerce platform integration
          external_variant_id: params.variantId,
          quantity: 1,
        },
      ],
      confirm: params.confirm,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Printful API error:', response.status, errorText)
    // Try to parse as JSON to get a cleaner error message
    try {
      const errorJson = JSON.parse(errorText)
      const message = errorJson.result || errorJson.error?.message || errorText
      throw new APIError(500, `Printful: ${message}`)
    } catch {
      throw new APIError(500, `Printful order failed (${response.status}): ${errorText.slice(0, 200)}`)
    }
  }

  const data = await response.json()
  return {
    id: data.result.id,
    status: data.result.status,
  }
}
