import clsx from 'clsx'
import { ReactNode, Ref, useEffect, useRef } from 'react'
import { Col } from '../layout/col'

/**
 * Inline market panels show orders below the panel; dialogs keep the ticket
 * compact and expand them below it only when asked.
 */
export function TradePanelLayout(props: {
  compact: boolean
  showOrders: boolean
  /** Changes each time the user opens the book; only then is it revealed. */
  revealOrders: number
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
    revealOrders,
    ordersId,
    header,
    orders,
    children,
    className,
    tradeFormRef,
  } = props
  const ordersRef = useRef<HTMLDivElement>(null)
  const revealed = useRef(revealOrders)

  // On a small screen the expanded book can start below the fold; scroll it up
  // so people see it opened. Only after the user opens it: a ticket that opens
  // with the book already expanded stays scrolled to the top.
  useEffect(() => {
    if (!compact || !showOrders || revealOrders === revealed.current) return
    const frame = requestAnimationFrame(() => {
      revealed.current = revealOrders
      if (ordersRef.current) revealBelowToggle(ordersRef.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [compact, showOrders, revealOrders])

  return (
    <>
      <Col className={clsx(className, 'relative rounded-xl px-4 py-2')}>
        {header}
        <div ref={tradeFormRef}>{children}</div>
        {compact && showOrders && (
          <div id={ordersId} ref={ordersRef} className="mt-2">
            {orders}
          </div>
        )}
      </Col>
      {!compact && orders}
    </>
  )
}

/** Room kept above the book so the toggle that opened it stays on screen. */
const TOGGLE_ROOM = 64

/**
 * Scrolls just enough to show the whole book, without scrolling the toggle
 * above it out of view.
 */
function revealBelowToggle(el: HTMLElement) {
  const scroller = scrollParent(el)
  const view = scroller
    ? scroller.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight }
  const box = el.getBoundingClientRect()
  const delta = Math.min(
    box.bottom - view.bottom + 16,
    box.top - view.top - TOGGLE_ROOM
  )
  if (delta > 0 && scroller)
    scroller.scrollBy({ top: delta, behavior: 'smooth' })
}

function scrollParent(el: HTMLElement) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    )
      return node
  }
  return null
}
