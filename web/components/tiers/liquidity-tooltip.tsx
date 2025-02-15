import { Placement } from '@floating-ui/react'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { MarketTierType } from 'common/tier'
import { formatWithToken, shortFormatNumber } from 'common/util/format'
import { capitalize } from 'lodash'
import {
  CrystalTier,
  PlayTier,
  PlusTier,
  PremiumTier,
} from 'web/public/custom-components/tiers'
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

export function getPresentedTierName(tier: MarketTierType) {
  if (tier == 'play') {
    return 'Basic'
  }

  return capitalize(tier)
}

export function TierIcon(props: { tier: MarketTierType; className?: string }) {
  const { tier, className } = props
  if (tier == 'play') {
    return <PlayTier className={className} />
  }

  if (tier == 'plus') {
    return <PlusTier className={className} />
  }
  if (tier == 'premium') {
    return <PremiumTier className={className} />
  }
  if (tier == 'crystal') {
    return <CrystalTier className={className} />
  }
  return <></>
}
