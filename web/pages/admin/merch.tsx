import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
import ShortToggle from 'web/components/widgets/short-toggle'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'
import { getMerchItems, getShopItem } from 'common/shop/items'
import { formatMoney } from 'common/util/format'
import { ShopOrder } from 'common/shop/types'
import { toast } from 'react-hot-toast'

const ORDER_STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-800',
  PENDING_FULFILLMENT: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-800',
}

export default function AdminMerchPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()

  if (!isAdmin) return <></>

  return (
    <Page trackPageView={'admin merch page'}>
      <NoSEO />
      <Col className="mx-8 gap-8">
        <Title>Merch Management</Title>
        <StockManagement />
        <OrderManagement />
      </Col>
    </Page>
  )
}

function StockManagement() {
  const { data: stockData, refresh } = useAPIGetter(
    'get-merch-stock-status',
    {}
  )
  const outOfStockSet = new Set(stockData?.outOfStockItems ?? [])
  const merchItems = getMerchItems()
  const [toggling, setToggling] = useState<string | null>(null)

  const handleToggle = async (itemId: string) => {
    const item = getShopItem(itemId)
    const currentlyOut = outOfStockSet.has(itemId)
    const message = currentlyOut
      ? `Enable sales for "${item?.name ?? itemId}"?\n\nThis will make the item available for purchase in the shop.`
      : `Disable sales for "${item?.name ?? itemId}"?\n\nThis will mark the item as out of stock and prevent new purchases.`
    if (!confirm(message)) return

    setToggling(itemId)
    try {
      await api('toggle-merch-stock', { itemId })
      toast.success(currentlyOut ? `${item?.name ?? itemId} is now in stock` : `${item?.name ?? itemId} marked out of stock`)
      refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to toggle stock status')
    } finally {
      setToggling(null)
    }
  }

  return (
    <Col className="gap-4">
      <h2 className="text-lg font-semibold">Stock Status</h2>
      <div className="border-ink-200 rounded-lg border">
        {merchItems.map((item) => {
          const isOutOfStock = outOfStockSet.has(item.id)
          return (
            <Row
              key={item.id}
              className="border-ink-200 items-center justify-between border-b px-4 py-3 last:border-b-0"
            >
              <Col className="gap-0.5">
                <span className="font-medium">{item.name}</span>
                <span className="text-ink-500 text-sm">
                  {formatMoney(item.price)} &middot; {item.id}
                </span>
              </Col>
              <Row className="items-center gap-3">
                <span
                  className={
                    isOutOfStock ? 'text-sm text-red-600' : 'text-sm text-green-600'
                  }
                >
                  {isOutOfStock ? 'Out of Stock' : 'In Stock'}
                </span>
                <ShortToggle
                  on={!isOutOfStock}
                  setOn={() => handleToggle(item.id)}
                  disabled={toggling === item.id}
                />
              </Row>
            </Row>
          )
        })}
      </div>
    </Col>
  )
}

function OrderManagement() {
  const [offset, setOffset] = useState(0)
  const limit = 25
  const { data, refresh } = useAPIGetter('get-merch-orders', {
    limit,
    offset,
  })
  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const handleCancel = async (
    orderId: string,
    username: string,
    itemName: string,
    amount: number
  ) => {
    if (
      !confirm(
        `Cancel order for @${username}?\n\nItem: ${itemName}\nRefund: ${formatMoney(amount)}\n\nThis will refund the full amount to the user.`
      )
    )
      return
    setCancellingId(orderId)
    try {
      const result = await api('cancel-merch-order', { orderId })
      toast.success(
        `Order cancelled. Refunded ${formatMoney(result.refundedAmount)} to @${username}`
      )
      refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel order')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <Col className="gap-4">
      <Row className="items-center justify-between">
        <h2 className="text-lg font-semibold">Orders ({total})</h2>
        <Row className="gap-2">
          <Button
            size="xs"
            color="gray-outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <span className="text-ink-500 self-center text-sm">
            {total === 0
              ? '0'
              : `${offset + 1}\u2013${Math.min(offset + limit, total)} of ${total}`}
          </span>
          <Button
            size="xs"
            color="gray-outline"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </Row>
      </Row>

      {orders.length === 0 ? (
        <p className="text-ink-500">No merch orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-ink-200 border-b text-left">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Printful Order</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  cancelling={cancellingId === order.id}
                  onCancel={handleCancel}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Col>
  )
}

function OrderRow(props: {
  order: ShopOrder & { username: string; displayName: string }
  cancelling: boolean
  onCancel: (
    orderId: string,
    username: string,
    itemName: string,
    amount: number
  ) => void
}) {
  const { order, cancelling, onCancel } = props
  const item = getShopItem(order.itemId)
  const itemName = item?.name ?? order.itemId
  const statusColor =
    ORDER_STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-800'
  const canCancel = !['CANCELLED', 'REFUNDED', 'FAILED', 'DELIVERED'].includes(
    order.status
  )

  return (
    <tr className="border-ink-200 border-b last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2">
        {new Date(order.createdTime).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </td>
      <td className="px-3 py-2">
        <a
          href={`/${order.username}`}
          className="text-primary-700 hover:underline"
        >
          @{order.username}
        </a>
      </td>
      <td className="px-3 py-2">{itemName}</td>
      <td className="px-3 py-2">{formatMoney(order.priceMana)}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
        >
          {order.status}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {order.txnId ? `manifold-${order.txnId}` : '\u2014'}
      </td>
      <td className="px-3 py-2">
        {canCancel && (
          <Button
            size="2xs"
            color="red"
            loading={cancelling}
            onClick={() =>
              onCancel(order.id, order.username, itemName, order.priceMana)
            }
          >
            Cancel & Refund
          </Button>
        )}
      </td>
    </tr>
  )
}
