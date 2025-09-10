export type ShopOrderStatus =
  | 'CREATED'
  | 'PAID'
  | 'FULFILLING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'

export type ShopOrder = {
  id: string
  userId: string
  itemId: string
  itemType: 'digital' | 'printful' | 'other'
  priceMana: number
  quantity: number
  txnId?: string
  printfulOrderId?: string
  printfulStatus?: string
  status: ShopOrderStatus
  statusSyncedTime?: string
  metadata?: Record<string, any>
  createdTime: string
  deliveredTime?: string
}
