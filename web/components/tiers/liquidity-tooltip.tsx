import { Placement } from '@floating-ui/react'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { formatWithToken, shortFormatNumber } from 'common/util/format'

import { Tooltip } from '../widgets/tooltip'
import { BsDroplet, BsDropletFill, BsDropletHalf } from 'react-icons/bs'
import {
  getTierIndexFromLiquidity,
  getTierIndexFromLiquidityAndAnswers,
} from 'common/tier'

export function LiquidityTooltip(props: {
  contract: Contract
  className?: string
  placement?: Placement
  iconClassName?: string
}) {
  const { contract, className, placement = 'bottom', iconClassName } = props
  const { mechanism } = contract

  const isCashContract = contract.token === 'CASH'
  const hasAnswers = contract.mechanism === 'cpmm-multi-1'
  const totalLiquidity =
    'totalLiquidity' in contract ? contract.totalLiquidity : 0
  const liquidityTier = hasAnswers
    ? getTierIndexFromLiquidityAndAnswers(
        totalLiquidity,
        contract.answers.length
      ) - 1
    : getTierIndexFromLiquidity(totalLiquidity)
  if (mechanism !== 'cpmm-multi-1' && mechanism !== 'cpmm-1') return <></>
  const amount = contract.totalLiquidity
  return (
    <Tooltip
      text={`${formatWithToken({
        amount,
        token: isCashContract ? 'CASH' : 'M$',
      })} in liquidity subsidies ${
        hasAnswers
          ? `(per answer: ${shortFormatNumber(
              amount / contract.answers.length
            )})`
          : ''
      }`}
      placement={placement}
      className={clsx('flex flex-row items-center gap-0.5', className)}
      tooltipClassName="z-40"
    >
      {liquidityTier < 1 ? (
        <BsDroplet className={iconClassName} />
      ) : liquidityTier < 2 ? (
        <BsDropletHalf className={iconClassName} />
      ) : (
        <BsDropletFill className={iconClassName} />
      )}
      {shortFormatNumber(amount)}
    </Tooltip>
  )
}
