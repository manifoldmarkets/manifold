import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { Row } from 'web/components/layout/row'

export type UserPosition = {
  name: string
  color?: string
  amount: number
  profit: number
}

export type UserLimitOrder = {
  name: string
  prob: number
  amount: number
}

export type UserNumericSummary = {
  total: number
  buckets: number
  profit: number
  orders?: { total: number; count: number }
}

export type PositionsData = {
  positions: UserPosition[]
  limitOrders: UserLimitOrder[]
  numericSummary?: UserNumericSummary
}

const MAX_SHOWN = 4

export function PositionsHovercard({
  positions,
  limitOrders,
  numericSummary,
}: PositionsData) {
  const sorted = [...positions].sort((a, b) => b.amount - a.amount)
  const shownPositions = sorted.slice(0, MAX_SHOWN)
  const extraPositions = sorted.length - shownPositions.length
  const shownOrders = limitOrders.slice(0, MAX_SHOWN)
  const extraOrders = limitOrders.length - shownOrders.length

  return (
    <div className="min-w-[220px] text-left">
      {positions.length > 0 && (
        <>
          <Row className="mb-2 items-center gap-1.5">
            <span className="bg-ink-300 h-2.5 w-2.5 flex-shrink-0 rounded-full" />
            <p className="text-ink-300 text-xs font-bold uppercase tracking-wider">
              Positions
            </p>
          </Row>
          {shownPositions.map((p) => (
            <Row
              key={p.name}
              className="mb-1 items-center justify-between gap-4"
            >
              <Row className="min-w-0 items-center gap-1.5">
                {p.color !== undefined && (
                  <span
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                )}
                <span className="min-w-0 truncate text-sm">{p.name}</span>
              </Row>
              <Row className="flex-shrink-0 items-center gap-1.5 text-sm font-semibold">
                <span>{formatMoney(p.amount)}</span>
                <span
                  className={p.profit >= 0 ? 'text-green-600' : 'text-red-500'}
                >
                  {p.profit >= 0 ? '+' : ''}
                  {formatMoney(p.profit)}
                </span>
              </Row>
            </Row>
          ))}
          {extraPositions > 0 && (
            <p className="text-ink-400 mt-0.5 text-[11px]">
              +{extraPositions} more — view market
            </p>
          )}
        </>
      )}
      {limitOrders.length > 0 && (
        <div className={positions.length > 0 ? 'mt-3' : ''}>
          <Row className="mb-2 items-center gap-1.5">
            <span className="border-ink-300 h-2.5 w-2.5 flex-shrink-0 rounded-full border" />
            <p className="text-ink-300 text-xs font-bold uppercase tracking-wider">
              Limit Orders
            </p>
          </Row>
          {shownOrders.map((o, i) => (
            <Row
              key={i}
              className="text-ink-400 mb-0.5 items-center gap-1 text-sm"
            >
              <span className="min-w-0 truncate">{o.name}</span>
              <span className="flex-shrink-0">
                at {o.prob}% — {formatMoney(o.amount)}
              </span>
            </Row>
          ))}
          {extraOrders > 0 && (
            <p className="text-ink-400 mt-0.5 text-[11px]">
              +{extraOrders} more — view market
            </p>
          )}
        </div>
      )}
      {numericSummary && (
        <>
          <Row className="mb-2 items-center gap-1.5">
            <span className="bg-ink-300 h-2.5 w-2.5 flex-shrink-0 rounded-full" />
            <p className="text-ink-300 text-xs font-bold uppercase tracking-wider">
              Positions
            </p>
          </Row>
          <Row className="items-center justify-between gap-4">
            <span className="text-ink-400 text-sm">
              {formatMoney(numericSummary.total)} across{' '}
              {numericSummary.buckets} buckets
            </span>
            <span
              className={clsx(
                'flex-shrink-0 text-sm font-semibold',
                numericSummary.profit >= 0 ? 'text-green-600' : 'text-red-500'
              )}
            >
              {numericSummary.profit >= 0 ? '+' : ''}
              {formatMoney(numericSummary.profit)}
            </span>
          </Row>
          {numericSummary.orders && (
            <div className="mt-3">
              <Row className="mb-2 items-center gap-1.5">
                <span className="border-ink-300 h-2.5 w-2.5 flex-shrink-0 rounded-full border" />
                <p className="text-ink-300 text-xs font-bold uppercase tracking-wider">
                  Limit Orders
                </p>
              </Row>
              <span className="text-ink-400 text-sm">
                {formatMoney(numericSummary.orders.total)} pending across{' '}
                {numericSummary.orders.count} orders
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
