import { Contract, MarketTierType } from 'common/contract'
import { Tooltip } from '../widgets/tooltip'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { getAnte, getTieredCost } from 'common/economy'
import clsx from 'clsx'
import {
  CrystalTier,
  PlusTier,
  PremiumTier,
} from 'web/public/custom-components/tiers'
import { capitalize } from 'lodash'
import { Placement } from '@floating-ui/react'

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
  const { outcomeType } = contract
  let numAnswers = undefined
  if ('answers' in contract) {
    numAnswers = contract.answers.length
  }

  if (tier == 'basic') {
    return <></>
  }
  return (
    <Tooltip
      text={`Starts with ${shortenNumber(
        getTieredCost(
          getAnte(outcomeType, numAnswers),
          tier,
          contract.outcomeType
        )
      )} liquidity`}
      placement={placement}
      noTap
      className={clsx(
        'flex flex-row items-center gap-0.5 font-semibold',
        className
      )}
    >
      <TierIcon tier={tier} className={iconClassName}/>
      {!noTitle && (
        <div
          className={clsx(
            tier == 'plus'
              ? 'text-blue-600 dark:text-blue-500'
              : tier == 'premium'
              ? 'text-purple-500 dark:text-purple-400'
              : tier == 'crystal'
              ? 'bg-gradient-to-r from-pink-700 to-pink-500 bg-clip-text text-transparent dark:from-pink-400 dark:to-pink-300'
              : ''
          )}
        >
          {capitalize(tier)}
        </div>
      )}
    </Tooltip>
  )
}

export function TierIcon(props: { tier: MarketTierType, className?: string}) {
  const { tier, className } = props
  if (tier == 'plus') {
    return <PlusTier className={className}/>
  }
  if (tier == 'premium') {
    return <PremiumTier className={className}/>
  }
  if (tier == 'crystal') {
    return <CrystalTier className={className}/>
  }
  return <></>
}
