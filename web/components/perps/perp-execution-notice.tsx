import {
  PerpOrder,
  PERP_NEXT_PRICE_NOTICE,
  PERP_PENDING_CLOSE_NOTICE,
} from 'common/perps/orders'
import { formatMoneyPrecise } from 'common/util/format'

export function PerpExecutionNotice({
  order,
  closing = false,
}: {
  order?: PerpOrder | null
  closing?: boolean
}) {
  const pending = order?.status === 'pending'
  const failed = order?.status === 'expired' || order?.status === 'rejected'
  return (
    <div
      className="text-ink-600 bg-canvas-50 border-ink-200 rounded-lg border px-3 py-2 text-xs leading-relaxed"
      role="status"
      aria-live="polite"
    >
      <p className="text-ink-700 font-medium">
        {pending
          ? 'Waiting for the next price'
          : failed
          ? 'Order did not fill'
          : 'Fills at the next price'}
      </p>
      <p className="mt-1">
        {pending
          ? 'Order submitted. It executes automatically even if you leave this page; if it cannot fill, you will be notified and any reserve is returned. Orders cannot be cancelled.'
          : failed
          ? order.error ??
            'Your order could not execute. Reserved mana was returned.'
          : PERP_NEXT_PRICE_NOTICE}
      </p>
      {failed && <p className="mt-1">Any reserved mana has been returned.</p>}
      {pending && order.reservedMana > 0 && (
        <p className="mt-1">
          {formatMoneyPrecise(order.reservedMana)} reserved until execution.
        </p>
      )}
      {pending && (
        <p className="mt-1">
          Expires{' '}
          {new Date(order.expiresTime).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          .
        </p>
      )}
      {closing && !failed && (
        <p className="mt-1">{PERP_PENDING_CLOSE_NOTICE}</p>
      )}
      {!failed && (
        <p className="mt-1">
          Updates may take longer on slow feeds. If the order expires, reserved
          mana is returned.
        </p>
      )}
    </div>
  )
}
