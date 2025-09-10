import { NextPage } from 'next'
import { useEffect, useMemo, useState } from 'react'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import type { ShopOrder } from 'common/shop/types'
import { TokenNumber } from 'web/components/widgets/token-number'
import { getEnabledConfigs } from 'common/shop/items'

const OrdersPage: NextPage = () => {
  const [orders, setOrders] = useState<ShopOrder[] | null>(null)

  const configMap = useMemo(() => {
    const map = new Map<string, { title: string; image?: string }>()
    for (const c of getEnabledConfigs()) {
      map.set(c.id, { title: c.title, image: c.images?.[0] })
    }
    return map
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await api('get-shop-orders', {})
        setOrders(res.orders)
      } catch {
        setOrders([])
      }
    })()
  }, [])

  return (
    <Page trackPageView="shop-orders">
      <Col className="mx-auto max-w-4xl gap-6 p-4 sm:p-6">
        <Row className="items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Order History</h1>
          <a href="/shop" className="text-primary-600 text-sm hover:underline">
            Back to shop
          </a>
        </Row>

        {orders === null ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse  p-4">
                <div className="bg-ink-100 h-4 w-1/3 rounded" />
                <div className="bg-ink-100 mt-2 h-4 w-1/5 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-ink-600">No orders yet.</div>
        ) : (
          <Col className="gap-3">
            {orders.map((o) => {
              const cfg = configMap.get(o.itemId)
              const title = cfg?.title ?? o.itemId
              const img = cfg?.image
              return (
                <Row
                  key={o.id}
                  className="items-center justify-between gap-4  p-4"
                >
                  <Row className="items-center gap-3">
                    <div className="bg-ink-100 h-14 w-14 overflow-hidden rounded">
                      {img ? (
                        <img
                          src={img}
                          alt="thumb"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>
                    <Col>
                      <div className="text-base font-medium">{title}</div>
                      <div className="text-ink-600 text-sm">
                        Placed {new Date(o.createdTime).toLocaleString()}
                      </div>
                      <div className="text-ink-700 text-sm capitalize">
                        {formatStatus(o)}
                      </div>
                      <div className="text-ink-600 text-xs">
                        Order ID: {o.id}
                      </div>
                    </Col>
                  </Row>
                  <div className="text-lg font-medium">
                    <TokenNumber amount={o.priceMana * o.quantity} isInline />
                  </div>
                </Row>
              )
            })}
          </Col>
        )}
      </Col>
    </Page>
  )
}

function formatStatus(o: ShopOrder): string {
  if (o.itemType === 'printful' && o.printfulStatus) {
    return `printful: ${o.printfulStatus}`
  }
  return o.status.toLowerCase()
}

export default OrdersPage
