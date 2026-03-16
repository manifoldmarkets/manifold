import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxnOutsideBetQueue, type TxnData } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getUser } from 'shared/utils'
import { getShopItem, isMerchItem, PRINTFUL_API_URL } from 'common/shop/items'
import { getBenefit } from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'
import { betsQueue } from 'shared/helpers/fn-queue'

export const shopPurchaseMerch: APIHandler<'shop-purchase-merch'> = async (
  { itemId, variantId, shippingCost, shipping },
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

  // Check if item is out of stock (fail-closed: if table doesn't exist, block purchase)
  try {
    const stockStatus = await pg.oneOrNone(
      `SELECT out_of_stock FROM merch_stock_status WHERE item_id = $1`,
      [itemId]
    )
    if (!stockStatus || stockStatus.out_of_stock) {
      throw new APIError(400, 'This item is currently out of stock')
    }
  } catch (e) {
    if (e instanceof APIError) throw e
    console.warn('merch_stock_status check failed (blocking purchase):', e)
    throw new APIError(400, 'This item is currently out of stock')
  }

  // Pre-phase: Verify shipping cost against Printful's actual rates.
  // We don't trust the client-provided shippingCost — always validate server-side.
  // Fail closed: if Printful rates API is unavailable, reject the order.
  const ratesResponse = await fetch(`${PRINTFUL_API_URL}/shipping/rates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${printfulToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: {
        address1: shipping.address1,
        city: shipping.city,
        state_code: shipping.state,
        country_code: shipping.country,
        zip: shipping.zip,
      },
      items: [{ external_variant_id: variantId, quantity: 1 }],
    }),
  })
  if (!ratesResponse.ok) {
    console.error('Printful shipping rates verification failed:', ratesResponse.status)
    throw new APIError(503, 'Unable to verify shipping rates — please try again')
  }
  const ratesData = await ratesResponse.json()
  const rates: { rate: string }[] = ratesData.result || []
  const validManaRates = rates.map((r) => Math.round(parseFloat(r.rate) * 100))
  if (!validManaRates.includes(shippingCost)) {
    throw new APIError(400, 'Invalid shipping cost — does not match any available rate')
  }

  // Phase 1: Charge the user atomically. Insert order as PENDING_FULFILLMENT.
  // Printful call happens AFTER this transaction commits to avoid holding a DB
  // transaction open across an external HTTP request.
  // Enqueue the whole function in the bet queue so we don't hold the user lock
  // while waiting in the queue.
  const { txnId, price, username } = await betsQueue.enqueueFn(
    () =>
      runTransactionWithRetries(async (tx) => {
        const user = await getUser(auth.uid, tx)
        if (!user) throw new APIError(401, 'Your account was not found')

        if (user.isBannedFromPosting) {
          throw new APIError(403, 'Your account is banned')
        }

        // Check one-time purchase limit (max 1 of each merch item per user)
        // Exclude FAILED/REFUNDED/CANCELLED so users can re-purchase after failed orders
        if (item.limit === 'one-time') {
          const existing = await tx.oneOrNone(
            `SELECT 1 FROM shop_orders
             WHERE user_id = $1 AND item_id = $2
             AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')
             LIMIT 1
             FOR UPDATE`,
            [auth.uid, itemId]
          )
          if (existing) {
            throw new APIError(403, 'You have already purchased this item (limit 1 per customer)')
          }
        }

        // Get supporter discount (applies to item price only, not shipping)
        const entRows = await tx.manyOrNone(
          `SELECT * FROM user_entitlements WHERE user_id = $1`,
          [auth.uid]
        )
        const currentEntitlements = entRows.map(convertEntitlement)
        const shopDiscount = getBenefit(currentEntitlements, 'shopDiscount', 0)
        const discountedItemPrice = shopDiscount > 0
          ? Math.floor(item.price * (1 - shopDiscount))
          : item.price
        const totalCharge = discountedItemPrice + shippingCost

        // Check balance
        if (user.balance < totalCharge) {
          throw new APIError(403, 'Insufficient balance')
        }

        // Create transaction to deduct mana (item price + shipping)
        const discountPercent = Math.round(shopDiscount * 100)
        const descriptionParts = [`Purchased ${item.name} (${variant.size})`]
        if (discountPercent > 0) {
          descriptionParts.push(`(${discountPercent}% supporter discount)`)
        }
        if (shippingCost > 0) {
          descriptionParts.push(`+ M$${shippingCost} shipping`)
        }
        const txnData: TxnData = {
          category: 'SHOP_PURCHASE',
          fromType: 'USER',
          fromId: auth.uid,
          toType: 'BANK',
          toId: 'BANK',
          amount: totalCharge,
          token: 'M$',
          description: descriptionParts.join(' '),
          data: { itemId, variantId, merchOrder: true, supporterDiscount: shopDiscount, shippingCost },
        }

        const txn = await runTxnOutsideBetQueue(tx, txnData)

        // Insert order record as PENDING_FULFILLMENT — Printful details added after tx
        await tx.none(
          `INSERT INTO shop_orders (user_id, item_id, price_mana, txn_id, status)
           VALUES ($1, $2, $3, $4, 'PENDING_FULFILLMENT')`,
          [auth.uid, itemId, totalCharge, txn.id]
        )

        return { txnId: txn.id, price: totalCharge, username: user.username }
      }),
    [auth.uid]
  )

  // Phase 2: Create Printful order outside the DB transaction.
  // If this fails, auto-refund the user and mark the order as FAILED.
  let printfulOrder: { id: number; status: string }
  try {
    printfulOrder = await createPrintfulOrder(printfulToken, {
      variantId,
      shipping,
      externalId: `manifold-${txnId}`,
      confirm: false, // Draft order - won't be charged or produced until confirmed
      packingSlipMessage: `@${username} (uid: ${auth.uid})`,
    })
  } catch (err) {
    // Auto-refund: create a reverse txn to return mana, then mark order FAILED
    const refundTxn: TxnData = {
      category: 'SHOP_PURCHASE',
      fromType: 'BANK',
      fromId: 'BANK',
      toType: 'USER',
      toId: auth.uid,
      amount: price,
      token: 'M$',
      description: `Refund: Printful order failed for ${item.name}`,
      data: { itemId, variantId, merchOrder: true, refund: true, originalTxnId: txnId },
    }
    await betsQueue.enqueueFn(
      () =>
        runTransactionWithRetries(async (tx) => {
          await runTxnOutsideBetQueue(tx, refundTxn)
          await tx.none(
            `UPDATE shop_orders SET status = 'FAILED' WHERE txn_id = $1`,
            [txnId]
          )
        }),
      [auth.uid]
    )
    throw err
  }

  // Phase 3: Update the order record with Printful details
  await pg.none(
    `UPDATE shop_orders
     SET printful_order_id = $1, printful_status = $2
     WHERE txn_id = $3`,
    [printfulOrder.id.toString(), printfulOrder.status, txnId]
  )

  return {
    success: true as const,
    printfulOrderId: printfulOrder.id.toString(),
    printfulStatus: printfulOrder.status,
  }
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
    packingSlipMessage?: string
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
          external_variant_id: params.variantId,
          quantity: 1,
        },
      ],
      confirm: params.confirm,
      ...(params.packingSlipMessage && {
        packing_slip: {
          message: params.packingSlipMessage,
        },
      }),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Printful API error:', response.status, errorText)
    try {
      const errorJson = JSON.parse(errorText)
      const message = errorJson.result || errorJson.error?.message || errorText
      throw new APIError(500, `Printful: ${message}`)
    } catch (e) {
      if (e instanceof APIError) throw e
      throw new APIError(500, `Printful order failed (${response.status}): ${errorText.slice(0, 200)}`)
    }
  }

  const data = await response.json()
  return {
    id: data.result.id,
    status: data.result.status,
  }
}
