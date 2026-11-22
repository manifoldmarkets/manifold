import clsx from 'clsx'
import { formatFeedPrice } from 'common/sports-price'
import { formatMoney } from 'common/util/format'
import {
  backsOutcome,
  hasOutcomeStake,
  type OutcomeStake,
} from './game-positions'

/**
 * Under a team (or the draw): what the account is paid if it wins, and any
 * open limit orders on it. Nothing when the account has neither, unless a
 * placeholder is asked for to keep neighbouring cells level.
 */
export function StakeLine(props: {
  stake?: OutcomeStake
  placeholder?: boolean
  /** A narrow strip cell: shorter order labels, and text may wrap. */
  compact?: boolean
  className?: string
}) {
  const { stake, placeholder, compact, className } = props
  if (!stake || !hasOutcomeStake(stake)) {
    return placeholder ? (
      <div className={clsx('min-h-[1rem]', className)} aria-hidden />
    ) : null
  }
  const itemClassName = clsx(
    'inline-flex items-center gap-1 tabular-nums',
    compact ? 'min-w-0 text-center' : 'whitespace-nowrap'
  )
  return (
    <div
      className={clsx(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4',
        className
      )}
    >
      {backsOutcome(stake) && (
        <span className={clsx(itemClassName, 'font-semibold text-teal-700')}>
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
            aria-hidden
          />
          Pays {formatMoney(stake.payoutIfWins)}
        </span>
      )}
      {stake.orders.map((order, i) => (
        <span key={i} className={clsx(itemClassName, 'text-ink-500')}>
          <span
            className="border-ink-400 h-1.5 w-1.5 shrink-0 rounded-full border"
            aria-hidden
          />
          <span className={compact ? 'sr-only' : undefined}>
            {order.against ? 'No' : 'Order'}{' '}
          </span>
          {order.against && compact ? 'No ' : ''}
          {formatMoney(order.amount)} at {formatFeedPrice(order.prob)}
        </span>
      ))}
    </div>
  )
}
