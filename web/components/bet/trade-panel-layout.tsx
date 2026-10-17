import clsx from 'clsx'
import { ReactNode, Ref } from 'react'
import { Col } from '../layout/col'

/**
 * Inline market panels show orders below the panel; dialogs keep the ticket
 * compact and expand them below it only when asked.
 */
export function TradePanelLayout(props: {
  compact: boolean
  showOrders: boolean
  ordersId: string
  header: ReactNode
  orders: ReactNode
  children: ReactNode
  className?: string
  tradeFormRef: Ref<HTMLDivElement>
}) {
  const {
    compact,
    showOrders,
    ordersId,
    header,
    orders,
    children,
    className,
    tradeFormRef,
  } = props
  return (
    <>
      <Col className={clsx(className, 'relative rounded-xl px-4 py-2')}>
        {header}
        <div ref={tradeFormRef}>{children}</div>
        {compact && showOrders && (
          <div id={ordersId} className="mt-2">
            {orders}
          </div>
        )}
      </Col>
      {!compact && orders}
    </>
  )
}
