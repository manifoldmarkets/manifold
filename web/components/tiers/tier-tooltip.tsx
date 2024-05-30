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

export function TierTooltip(props: {
  tier: MarketTierType
  contract: Contract
  className?: string
}) {
  const { tier, contract, className } = props
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
      placement="bottom"
      noTap
      className={clsx(
        'flex flex-row items-center gap-0.5 font-semibold',
        className
      )}
    >
      {tier == 'plus' ? (
        <PlusTier />
      ) : tier == 'premium' ? (
        <PremiumTier />
      ) : tier == 'crystal' ? (
        <CrystalTier />
      ) : null}
      <div
        className={clsx(
          tier == 'plus'
            ? 'text-purple-600 dark:text-purple-500'
            : tier == 'premium'
            ? 'text-fuchsia-500 dark:text-fuchsia-400'
            : tier == 'crystal'
            ? 'bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent dark:from-purple-400 dark:to-pink-300'
            : ''
        )}
      >
        {capitalize(tier)}
      </div>
    </Tooltip>
  )
}
