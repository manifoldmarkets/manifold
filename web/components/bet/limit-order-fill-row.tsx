import { LimitOrderFill } from 'common/bet'
import { formatShares } from 'common/util/format'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'

/** Shows how much of a quote rests on other people's limit orders rather than
 * on the pool. Without it, the order book's contribution is invisible: the
 * numbers just move when an order is posted, taken or cancelled, and there's
 * nothing on screen to say why. */
export function LimitOrderFillRow(props: {
  fill: LimitOrderFill
  isCashContract: boolean
  /** Shares in the trade overall, to show the limit order share against. */
  totalShares?: number
}) {
  const { fill, isCashContract, totalShares } = props
  const { shares, orderCount } = fill

  if (shares <= 0 || orderCount === 0) return null

  const showTotal = totalShares !== undefined && totalShares > shares

  return (
    <Row className="items-center justify-between">
      <span className="text-ink-500">
        Filled by limit orders{' '}
        <InfoTooltip
          text={`${orderCount} resting ${
            orderCount === 1 ? 'order takes' : 'orders take'
          } part of this trade instead of the pool. If ${
            orderCount === 1 ? 'it is' : 'they are'
          } cancelled or taken first, your price moves.`}
        />
      </span>
      <span className="text-ink-600 tabular-nums">
        {formatShares(shares, isCashContract)}
        {showTotal && ` of ${formatShares(totalShares, isCashContract)}`} shares
      </span>
    </Row>
  )
}
