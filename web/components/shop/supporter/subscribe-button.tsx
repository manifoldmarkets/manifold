import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import {
  SUPPORTER_TIERS,
  SupporterTier,
  canUpgradeTo,
  wasEverSupporter,
} from 'common/supporter-config'
import { UserEntitlement } from 'common/shop/types'
import { Button } from 'web/components/buttons/button'
import { TIER_ITEMS } from './tier-items'

export function SubscribeButton({
  tier,
  currentTier,
  effectiveBalance,
  loading,
  disabled,
  onClick,
  entitlements,
}: {
  tier: SupporterTier
  currentTier: SupporterTier | null
  effectiveBalance: number
  loading: boolean
  disabled: boolean
  onClick: () => void
  entitlements?: UserEntitlement[]
}) {
  const tierConfig = SUPPORTER_TIERS[tier]
  const item = TIER_ITEMS[tier]
  const canAfford = effectiveBalance >= item.price
  const isCurrentTier = currentTier === tier
  const canUpgrade = canUpgradeTo(currentTier, tier)
  const isLowerTier = !!currentTier && !canUpgrade && !isCurrentTier

  // Check if user was ever a supporter (for "Renew" text on expired subscriptions)
  const wasSupporter = wasEverSupporter(entitlements)
  const isExpiredSupporter = wasSupporter && !currentTier

  const buttonText = isCurrentTier
    ? `Extend ${tierConfig.name}`
    : currentTier && canUpgrade
      ? `Upgrade to ${tierConfig.name}`
      : isExpiredSupporter
        ? `Renew ${tierConfig.name}`
        : `Become a ${tierConfig.name} Supporter`

  return (
    <Button
      color={tier === 'premium' ? 'amber' : tier === 'plus' ? 'indigo' : 'gray'}
      size="xl"
      className={clsx(
        'w-full transition-all duration-200',
        tier === 'premium' && 'shadow-lg shadow-amber-500/25',
        tier === 'plus' && 'shadow-lg shadow-indigo-500/25'
      )}
      onClick={onClick}
      disabled={disabled || !canAfford || isLowerTier}
      loading={loading}
    >
      {isLowerTier
        ? 'Already have higher tier'
        : !canAfford
          ? 'Insufficient balance'
          : `${buttonText} - ${formatMoney(item.price)}/mo`}
    </Button>
  )
}
