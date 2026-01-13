// Database row from user_entitlements table
export type UserEntitlement = {
  userId: string
  entitlementId: string // matches ShopItem.id (e.g., 'pampu-skin')
  grantedTime: number // timestamp
  expiresTime?: number // null = permanent
  enabled: boolean
}

// Database row from shop_orders table
export type ShopOrder = {
  id: string
  userId: string
  itemId: string // matches ShopItem.id
  priceMana: number
  quantity: number
  txnId?: string // reference to txns table
  printfulOrderId?: string // from Printful API (future)
  printfulStatus?: string // synced from Printful (future)
  status:
    | 'CREATED'
    | 'COMPLETED'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'FAILED'
  metadata?: Record<string, any> // size, color, variant, etc.
  createdTime: number
  shippedTime?: number
  deliveredTime?: number
}

// Converter from database row (snake_case) to TypeScript type (camelCase)
export const convertEntitlement = (row: {
  user_id: string
  entitlement_id: string
  granted_time: string
  expires_time?: string | null
  enabled: boolean
}): UserEntitlement => ({
  userId: row.user_id,
  entitlementId: row.entitlement_id,
  grantedTime: new Date(row.granted_time).getTime(),
  expiresTime: row.expires_time ? new Date(row.expires_time).getTime() : undefined,
  enabled: row.enabled,
})

export const convertShopOrder = (row: {
  id: string
  user_id: string
  item_id: string
  price_mana: number
  quantity: number
  txn_id?: string | null
  printful_order_id?: string | null
  printful_status?: string | null
  status: string
  metadata?: Record<string, any> | null
  created_time: string
  shipped_time?: string | null
  delivered_time?: string | null
}): ShopOrder => ({
  id: row.id,
  userId: row.user_id,
  itemId: row.item_id,
  priceMana: row.price_mana,
  quantity: row.quantity,
  txnId: row.txn_id ?? undefined,
  printfulOrderId: row.printful_order_id ?? undefined,
  printfulStatus: row.printful_status ?? undefined,
  status: row.status as ShopOrder['status'],
  metadata: row.metadata ?? undefined,
  createdTime: new Date(row.created_time).getTime(),
  shippedTime: row.shipped_time ? new Date(row.shipped_time).getTime() : undefined,
  deliveredTime: row.delivered_time
    ? new Date(row.delivered_time).getTime()
    : undefined,
})
