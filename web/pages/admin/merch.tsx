import { useMemo, useState } from 'react'
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
        <p className="text-ink-500 -mt-4 text-sm">
          Always refresh the page before canceling an order in case the status
          has changed.
        </p>
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
      ? `Enable sales for "${
          item?.name ?? itemId
        }"?\n\nThis will make the item available for purchase in the shop.`
      : `Disable sales for "${
          item?.name ?? itemId
        }"?\n\nThis will mark the item as out of stock and prevent new purchases.`
    if (!confirm(message)) return

    setToggling(itemId)
    try {
      await api('toggle-merch-stock', { itemId })
      toast.success(
        currentlyOut
          ? `${item?.name ?? itemId} is now in stock`
          : `${item?.name ?? itemId} marked out of stock`
      )
      refresh()
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to toggle stock status'
      )
    } finally {
      setToggling(null)
    }
  }

  return (
    <details className="border-ink-200 rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-lg font-semibold">
        Stock Status
      </summary>
      <div className="border-ink-200 border-t">
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
                    isOutOfStock
                      ? 'text-sm text-red-600'
                      : 'text-sm text-green-600'
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
    </details>
  )
}

type ViewMode =
  | 'recent'
  | 'week'
  | 'month'
  | '3-months'
  | '6-months'
  | 'year'
  | 'all'
// Each view maps to a (dateRange, limit) pair sent to the backend. 'recent'
// is the cheap default — newest 25, no date filter. Wider ranges raise the
// limit to surface all qualifying orders (capped at 2000 by the schema).
const VIEW_MODES: {
  value: ViewMode
  label: string
  dateRange: 'all' | 'week' | 'month' | '3-months' | '6-months' | 'year'
  limit: number
}[] = [
  { value: 'recent', label: 'Last 25', dateRange: 'all', limit: 25 },
  { value: 'week', label: 'Last week', dateRange: 'week', limit: 2000 },
  { value: 'month', label: 'Last month', dateRange: 'month', limit: 2000 },
  {
    value: '3-months',
    label: 'Last 3 months',
    dateRange: '3-months',
    limit: 2000,
  },
  {
    value: '6-months',
    label: 'Last 6 months',
    dateRange: '6-months',
    limit: 2000,
  },
  { value: 'year', label: 'Last year', dateRange: 'year', limit: 2000 },
  { value: 'all', label: 'All time', dateRange: 'all', limit: 2000 },
]

// Statuses excluded from stats. Mirrors REVENUE_STATUSES_SQL in
// get-merch-orders.ts and the merchSales filter in get-shop-stats.ts.
const REVENUE_EXCLUDED: ReadonlySet<ShopOrder['status']> = new Set([
  'CANCELLED',
  'REFUNDED',
  'FAILED',
] as const)

type MerchStats = {
  perItem: {
    itemId: string
    orderCount: number
    totalMana: number
    avgMana: number
  }[]
  overall: {
    orderCount: number
    totalMana: number
    avgMana: number
  }
}

function computeStats(orders: ShopOrder[]): MerchStats {
  const revenue = orders.filter((o) => !REVENUE_EXCLUDED.has(o.status))

  const byItem = new Map<string, number[]>()
  for (const o of revenue) {
    const arr = byItem.get(o.itemId)
    if (arr) arr.push(o.priceMana)
    else byItem.set(o.itemId, [o.priceMana])
  }

  const perItem = Array.from(byItem.entries())
    .map(([itemId, prices]) => {
      const totalMana = prices.reduce((s, p) => s + p, 0)
      return {
        itemId,
        orderCount: prices.length,
        totalMana,
        avgMana: totalMana / prices.length,
      }
    })
    .sort((a, b) => b.totalMana - a.totalMana)

  const totalMana = revenue.reduce((s, o) => s + o.priceMana, 0)
  const overall = {
    orderCount: revenue.length,
    totalMana,
    avgMana: revenue.length === 0 ? 0 : totalMana / revenue.length,
  }

  return { perItem, overall }
}

function OrderManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>('recent')
  const mode = VIEW_MODES.find((m) => m.value === viewMode) ?? VIEW_MODES[0]

  const { data, refresh } = useAPIGetter('get-merch-orders', {
    limit: mode.limit,
    offset: 0,
    dateRange: mode.dateRange,
  })
  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  // Stats are computed from the visible orders, not the underlying
  // date-filtered set, so 'Last 25' shows stats for those 25 (matches
  // what's on screen) rather than all-time. For wider ranges the visible
  // set IS the full window (up to the 2000 cap), so this is equivalent.
  const stats = useMemo(() => computeStats(orders), [orders])
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const handleCancel = async (
    orderId: string,
    username: string,
    itemName: string,
    amount: number,
    printfulOrderId: string | undefined
  ) => {
    if (
      !confirm(
        `Cancel order for @${username}?\n\nItem: ${itemName}\nRefund: ${formatMoney(
          amount
        )}\nPrintful: ${
          printfulOrderId ?? '—'
        }\n\nThis will refund the full amount to the user and cancel the draft on Printful.`
      )
    )
      return
    setCancelingId(orderId)
    try {
      const result = await api('cancel-merch-order', { orderId })
      toast.success(
        `Order canceled. Refunded ${formatMoney(
          result.refundedAmount
        )} to @${username}`
      )
      refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel order')
    } finally {
      setCancelingId(null)
    }
  }

  return (
    <Col className="gap-4">
      <Row className="flex-wrap items-center gap-2">
        <span className="text-ink-500 text-sm">View:</span>
        {VIEW_MODES.map((opt) => (
          <Button
            key={opt.value}
            size="xs"
            color={viewMode === opt.value ? 'indigo' : 'gray-outline'}
            onClick={() => setViewMode(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </Row>

      <OrderStats stats={stats} />

      <Row className="items-center justify-between">
        <h2 className="text-lg font-semibold">Orders ({total})</h2>
        <span className="text-ink-500 self-center text-sm">
          Showing {orders.length}
          {orders.length >= mode.limit && ` (capped at ${mode.limit})`}
        </span>
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
                  canceling={cancelingId === order.id}
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

function OrderStats(props: {
  stats: {
    perItem: {
      itemId: string
      orderCount: number
      totalMana: number
      avgMana: number
    }[]
    overall: {
      orderCount: number
      totalMana: number
      avgMana: number
    }
  }
}) {
  const { perItem, overall } = props.stats

  return (
    <details className="border-ink-200 rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-base font-semibold">
        Sales summary
      </summary>
      <Col className="border-ink-200 gap-3 border-t p-4">
        <span className="text-ink-500 text-xs">
          Excludes cancelled, refunded, and failed orders.
        </span>

        <Row className="flex-wrap gap-6">
          <StatBlock
            label="Orders"
            value={overall.orderCount.toLocaleString()}
          />
          <StatBlock
            label="Total mana"
            value={formatMoney(overall.totalMana)}
          />
          <StatBlock
            label="Average per order"
            value={formatMoney(Math.round(overall.avgMana))}
          />
        </Row>

        {perItem.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-ink-200 border-b text-left">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Orders</th>
                  <th className="px-3 py-2 text-right">Total mana</th>
                  <th className="px-3 py-2 text-right">Average mana</th>
                </tr>
              </thead>
              <tbody>
                {perItem.map((row) => {
                  const item = getShopItem(row.itemId)
                  return (
                    <tr
                      key={row.itemId}
                      className="border-ink-200 border-b last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        {item?.name ?? row.itemId}
                        <span className="text-ink-500 ml-2 text-xs">
                          {row.itemId}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.orderCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(row.totalMana)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(Math.round(row.avgMana))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Col>
    </details>
  )
}

function StatBlock(props: { label: string; value: string }) {
  return (
    <Col className="gap-0.5">
      <span className="text-ink-500 text-xs uppercase tracking-wide">
        {props.label}
      </span>
      <span className="text-lg font-semibold">{props.value}</span>
    </Col>
  )
}

function OrderRow(props: {
  order: ShopOrder & { username: string; displayName: string }
  canceling: boolean
  onCancel: (
    orderId: string,
    username: string,
    itemName: string,
    amount: number,
    printfulOrderId: string | undefined
  ) => void
}) {
  const { order, canceling, onCancel } = props
  const item = getShopItem(order.itemId)
  const itemName = item?.name ?? order.itemId
  // Build a short variant suffix from order.metadata (populated on new orders
  // since the wordmark-tshirt commit). Skipped for single-variant items where
  // 'One Size' would be noise. Legacy orders pre-metadata show no suffix.
  const meta = order.metadata as { size?: string; color?: string } | undefined
  const variantLabel = meta?.color
    ? `${meta.color} / ${meta.size ?? '?'}`
    : meta?.size && meta.size !== 'One Size'
    ? meta.size
    : null
  const statusColor =
    ORDER_STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-800'
  const canCancel = !['SHIPPED', 'CANCELLED', 'REFUNDED', 'FAILED'].includes(
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
      <td className="px-3 py-2">
        {itemName}
        {variantLabel && (
          <span className="text-ink-500"> — {variantLabel}</span>
        )}
      </td>
      <td className="px-3 py-2">{formatMoney(order.priceMana)}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
        >
          {order.status}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {/* Printful ID stacked above our manifold-{txnId} ref so admins can
            cross-reference both without widening the table. */}
        <div>
          <span className="text-ink-500">Printful:</span>{' '}
          {order.printfulOrderId ?? '—'}
        </div>
        <div>
          <span className="text-ink-500">Manifold:</span>{' '}
          {order.txnId ? `manifold-${order.txnId}` : '—'}
        </div>
      </td>
      <td className="px-3 py-2">
        {canCancel && (
          <Button
            size="2xs"
            color="red"
            loading={canceling}
            onClick={() =>
              onCancel(
                order.id,
                order.username,
                variantLabel ? `${itemName} — ${variantLabel}` : itemName,
                order.priceMana,
                order.printfulOrderId
              )
            }
          >
            Cancel & Refund
          </Button>
        )}
      </td>
    </tr>
  )
}
