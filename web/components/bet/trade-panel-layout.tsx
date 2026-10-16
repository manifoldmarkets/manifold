import clsx from 'clsx'
import { ReactNode, Ref } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

/** Orders replace the ticket in dialogs; inline market panels keep both. */
export function TradePanelLayout(props: {
  compact: boolean
  showOrders: boolean
  setShowOrders: (show: boolean) => void
  orderCount: number
  header: ReactNode
  orders: ReactNode
  controls: ReactNode
  children: ReactNode
  className?: string
  tradeFormRef: Ref<HTMLDivElement>
}) {
  const {
    compact,
    showOrders,
    setShowOrders,
    orderCount,
    header,
    orders,
    children,
    controls,
    className,
    tradeFormRef,
  } = props
  return (
    <>
      <Col className={clsx(className, 'relative rounded-xl px-4 py-2')}>
        {header}
        {compact && (
          <Row className="mb-1 items-center justify-between gap-2">
            <button
              type="button"
              aria-pressed={showOrders}
              onClick={() => setShowOrders(!showOrders)}
              className="text-primary-700 hover:bg-primary-50 -ml-2 rounded-md px-2 py-2 text-sm font-medium"
            >
              {showOrders ? 'Back to trade' : `Order book (${orderCount})`}
            </button>
            {controls}
          </Row>
        )}
        {/* Keep amounts, prices and expiration mounted while viewing orders. */}
        <div ref={tradeFormRef} hidden={compact && showOrders}>
          {children}
        </div>
        {compact && showOrders && (
          <div className="max-h-[min(32rem,60dvh)] overflow-y-auto overscroll-contain">
            {orders}
          </div>
        )}
      </Col>
      {!compact && orders}
    </>
  )
}
