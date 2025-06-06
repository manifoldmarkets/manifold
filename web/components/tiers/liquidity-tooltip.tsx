import { Placement } from '@floating-ui/react'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { formatWithToken, shortFormatNumber } from 'common/util/format'

import { Tooltip } from '../widgets/tooltip'
import { GiWaterDrop } from 'react-icons/gi'

export function LiquidityTooltip(props: {
  contract: Contract
  className?: string
  placement?: Placement
  iconClassName?: string
}) {
  const { contract, className, placement = 'bottom', iconClassName } = props
  const { mechanism } = contract

  const isCashContract = contract.token === 'CASH'

  if (mechanism !== 'cpmm-multi-1' && mechanism !== 'cpmm-1') return <></>
  const amount = contract.totalLiquidity
  return (
    <Tooltip
      text={`${formatWithToken({
        amount,
        token: isCashContract ? 'CASH' : 'M$',
      })} in liquidity subsidies`}
      placement={placement}
      noTap
      className={clsx('flex flex-row items-center gap-0.5', className)}
      tooltipClassName="z-40"
    >
      <GiWaterDrop className={iconClassName} />
      {shortFormatNumber(amount)}
    </Tooltip>
  )
}
