import { LimitOrderFill } from 'common/bet'
import { Contract } from 'common/contract'
import { getStonkDisplayShares } from 'common/stonk'
import { formatShares } from 'common/util/format'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'

/** Keep the units consistent with the panel, including fractional stock shares. */
const displayShares = (shares: number, contract: Contract) => {
  if (contract.outcomeType === 'STONK') {
    const displayed = getStonkDisplayShares(contract, shares, 2)
    return displayed > 0
      ? `${displayed}`
      : `< ${getStonkDisplayShares(contract, 1, 2)}`
  }
  const isCash = contract.token === 'CASH'
  if (shares < (isCash ? 0.01 : 1)) return isCash ? '< 0.01' : '< 1'
  return formatShares(shares, isCash)
}

export function LimitOrderFillRow(props: {
  fill: LimitOrderFill
  contract: Contract
  /** Shares filled immediately, excluding any new resting limit order. */
  totalShares?: number
}) {
  const { fill, contract, totalShares } = props
  const { shares, orderCount, otherAnswerOrderCount = 0 } = fill
  const hasDirectFill = shares > 0 && orderCount > 0
  if (!hasDirectFill && otherAnswerOrderCount === 0) return null

  const filled = displayShares(shares, contract)
  const total =
    totalShares === undefined ? undefined : displayShares(totalShares, contract)
  const showTotal =
    totalShares !== undefined && totalShares > shares && total !== filled
  const directText = hasDirectFill
    ? `This quote matches ${orderCount} resting ${
        orderCount === 1 ? 'order' : 'orders'
      } for this outcome. `
    : ''
  const otherText = otherAnswerOrderCount
    ? `${
        hasDirectFill ? 'It also' : 'This quote'
      } depends on ${otherAnswerOrderCount} resting ${
        otherAnswerOrderCount === 1 ? 'order' : 'orders'
      } on other answers. `
    : ''

  return (
    <Row className="items-center justify-between">
      <span className="text-ink-500">
        {hasDirectFill ? 'Filled by limit orders' : 'Other-answer limit orders'}{' '}
        <InfoTooltip
          text={`${directText}${otherText}Orders can change before your trade executes; the final price may differ.`}
        />
      </span>
      <span className="text-ink-600 tabular-nums">
        {hasDirectFill
          ? `${filled}${showTotal ? ` of ${total}` : ''} shares`
          : `${otherAnswerOrderCount} ${
              otherAnswerOrderCount === 1 ? 'order' : 'orders'
            }`}
      </span>
    </Row>
  )
}
