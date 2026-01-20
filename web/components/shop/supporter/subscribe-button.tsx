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
  onCancelClick,
  entitlements,
  daysRemaining = 0,
  isAutoRenewing = false,
}: {
  tier: SupporterTier
  currentTier: SupporterTier | null
  effectiveBalance: number
  loading: boolean
  disabled: boolean
  onClick: () => void
  onCancelClick?: () => void
  entitlements?: UserEntitlement[]
  daysRemaining?: number
  isAutoRenewing?: boolean
}) {
  const tierConfig = SUPPORTER_TIERS[tier]
  const item = TIER_ITEMS[tier]
  const isCurrentTier = currentTier === tier
  const canUpgrade = canUpgradeTo(currentTier, tier)
  const isLowerTier = !!currentTier && !canUpgrade && !isCurrentTier

  // If user is on their current tier and auto-renewing, show cancel button
  if (isCurrentTier && isAutoRenewing) {
    return (
      <Button
        color="gray-outline"
        size="xl"
        className="w-full"
        onClick={onCancelClick}
        disabled={disabled}
        loading={loading}
      >
        Cancel Subscription
      </Button>
    )
  }

  // If user is on their current tier but cancelled (not auto-renewing), show resubscribe
  if (isCurrentTier && !isAutoRenewing) {
    const canAfford = effectiveBalance >= item.price
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
        disabled={disabled || !canAfford}
        loading={loading}
      >
        {!canAfford ? 'Insufficient balance' : `Resubscribe - ${formatMoney(item.price)}/mo`}
      </Button>
    )
  }

  // Calculate upgrade credit (matches backend logic)
  const upgradeCredit =
    canUpgrade && currentTier && daysRemaining > 0
      ? Math.floor(daysRemaining * (TIER_ITEMS[currentTier].price / 30))
      : 0
  const finalPrice = Math.max(0, item.price - upgradeCredit)
  const canAfford = effectiveBalance >= finalPrice

  // Check if user was ever a supporter (for "Renew" text on expired subscriptions)
  const wasSupporter = wasEverSupporter(entitlements)
  const isExpiredSupporter = wasSupporter && !currentTier

  const buttonText = currentTier && canUpgrade
    ? `Upgrade to ${tierConfig.name}`
    : isExpiredSupporter
      ? `Renew ${tierConfig.name}`
      : `Become a ${tierConfig.name} member`

  // Show different price text for upgrades with credit
  const priceText =
    upgradeCredit > 0
      ? formatMoney(finalPrice)
      : `${formatMoney(item.price)}/mo`

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
          : `${buttonText} - ${priceText}`}
    </Button>
  )
}
