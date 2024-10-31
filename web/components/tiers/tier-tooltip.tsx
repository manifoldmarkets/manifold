import { Placement } from '@floating-ui/react'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { MarketTierType } from 'common/tier'
import { formatWithToken } from 'common/util/format'
import { capitalize } from 'lodash'
import {
  CrystalTier,
  PlayTier,
  PlusTier,
  PremiumTier,
} from 'web/public/custom-components/tiers'
import { Tooltip } from '../widgets/tooltip'

export function TierTooltip(props: {
  tier: MarketTierType
  contract: Contract
  className?: string
  noTitle?: boolean
  placement?: Placement
  iconClassName?: string
}) {
  const {
    tier,
    contract,
    className,
    noTitle,
    placement = 'bottom',
    iconClassName,
  } = props
  const { mechanism } = contract

  const isCashContract = contract.token === 'CASH'

  if (mechanism !== 'cpmm-multi-1' && mechanism !== 'cpmm-1') return <></>

  return (
    <Tooltip
      text={`${formatWithToken({
        amount: contract.totalLiquidity,
        token: isCashContract ? 'CASH' : 'M$',
      })} in liquidity subsidies`}
      placement={placement}
      noTap
      className={clsx('flex flex-row items-center gap-0.5', className)}
      tooltipClassName="z-40"
    >
      <TierIcon tier={tier} className={iconClassName} />
      {!noTitle && (
        <div
          className={clsx(
            tier == 'plus'
              ? 'font-semibold text-blue-600 dark:text-blue-500'
              : tier == 'premium'
              ? 'font-semibold text-purple-500 dark:text-purple-400'
              : tier == 'crystal'
              ? 'bg-gradient-to-r from-pink-700 to-pink-500 bg-clip-text font-semibold text-transparent dark:from-pink-400 dark:to-pink-300'
              : ''
          )}
        >
          {getPresentedTierName(tier)}
        </div>
      )}
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
