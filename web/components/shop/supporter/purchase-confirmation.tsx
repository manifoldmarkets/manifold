import { formatMoney } from 'common/util/format'
import {
  SUPPORTER_TIERS,
  SupporterTier,
  canUpgradeTo,
} from 'common/supporter-config'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { TIER_ITEMS } from './tier-items'
import { DAY_MS } from 'common/util/time'

export function PurchaseConfirmation({
  tier,
  currentTier,
  daysRemaining,
  currentExpiresTime,
  loading,
  onConfirm,
  onCancel,
}: {
  tier: SupporterTier
  currentTier: SupporterTier | null
  daysRemaining: number // for display only
  currentExpiresTime?: number // for accurate credit calculation
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const tierConfig = SUPPORTER_TIERS[tier]
  const item = TIER_ITEMS[tier]
  const isUpgrade = currentTier && canUpgradeTo(currentTier, tier)
  const isDowngrade = currentTier && !canUpgradeTo(currentTier, tier) && currentTier !== tier
  const isSameTierRenewal = currentTier === tier

  // Calculate credit from remaining time (matches backend - uses fractional days)
  const msRemaining = currentExpiresTime ? Math.max(0, currentExpiresTime - Date.now()) : 0
  const fractionalDaysRemaining = msRemaining / DAY_MS
  const tierChangeCredit =
    (isUpgrade || isDowngrade) && fractionalDaysRemaining > 0
      ? Math.floor(fractionalDaysRemaining * (TIER_ITEMS[currentTier!].price / 30))
      : 0
  const finalPrice = Math.max(0, item.price - tierChangeCredit)

  return (
    <Col className="bg-canvas-0 max-w-md rounded-xl p-6">
      <h2 className="mb-2 text-xl font-bold">Confirm Purchase</h2>

      {/* Same-tier renewal - show time stacking info */}
      {isSameTierRenewal && daysRemaining > 0 ? (
        <>
          <p className="text-ink-600 mb-4">
            You're about to renew{' '}
            <strong>{tierConfig.name} Supporter</strong> for{' '}
            <span className="font-semibold text-amber-600">
              {formatMoney(item.price)}
            </span>
          </p>
          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <div className="font-medium">Time will be added to your subscription:</div>
            <div className="mt-1">
              {daysRemaining} days remaining + 30 days ={' '}
              <span className="font-bold">{daysRemaining + 30} days total</span>
            </div>
          </div>
        </>
      ) : isDowngrade ? (
        /* Downgrade - simplified view */
        <>
          <p className="text-ink-600 mb-2">
            You're about to downgrade to <strong>{tierConfig.name} Supporter</strong>
          </p>
          <div className="mb-4 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
            <div className="space-y-1 text-sm">
              <Row className="justify-between text-amber-800 dark:text-amber-200">
                <span>{tierConfig.name} price:</span>
                <span>{formatMoney(item.price)} / month</span>
              </Row>
              <Row className="justify-between border-t border-amber-200 pt-1 font-bold text-amber-800 dark:border-amber-700 dark:text-amber-200">
                <span>Due today:</span>
                <span className={finalPrice === 0 ? 'text-green-600' : 'text-amber-600'}>
                  {finalPrice === 0 ? 'Free' : formatMoney(finalPrice)}
                </span>
              </Row>
            </div>
          </div>
          <p className="text-ink-500 mb-4 text-sm">
            Your subscription will switch to {tierConfig.name} immediately.
            {finalPrice > 0 && ' Unused time reduces what\'s due today but isn\'t refunded.'}
          </p>
        </>
      ) : isUpgrade && tierChangeCredit > 0 ? (
        /* Upgrade with credit */
        <>
          <p className="text-ink-600 mb-2">
            You're about to upgrade to <strong>{tierConfig.name} Supporter</strong>
          </p>
          <div className="mb-4 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
            <div className="space-y-1 text-sm">
              <Row className="justify-between text-green-800 dark:text-green-200">
                <span>{tierConfig.name} price:</span>
                <span>{formatMoney(item.price)} / month</span>
              </Row>
              <Row className="justify-between text-green-800 dark:text-green-200">
                <span>
                  Credit ({daysRemaining}d of {SUPPORTER_TIERS[currentTier!].name}):
                </span>
                <span className="text-green-600 dark:text-green-400">
                  -{formatMoney(tierChangeCredit)}
                </span>
              </Row>
              <Row className="justify-between border-t border-green-200 pt-1 font-bold text-green-800 dark:border-green-700 dark:text-green-200">
                <span>Due today:</span>
                <span className="text-amber-600">{formatMoney(finalPrice)}</span>
              </Row>
            </div>
          </div>
        </>
      ) : (
        /* Normal purchase */
        <p className="text-ink-600 mb-4">
          You're about to {isUpgrade ? 'upgrade to' : isDowngrade ? 'downgrade to' : 'purchase'}{' '}
          <strong>{tierConfig.name} Supporter</strong> for{' '}
          <span className="font-semibold text-amber-600">
            {formatMoney(item.price)}
          </span>
        </p>
      )}

      <Row className="justify-end gap-2">
        <Button color="gray-outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          color={tier === 'premium' ? 'amber' : tier === 'plus' ? 'indigo' : 'gray'}
          loading={loading}
          onClick={onConfirm}
        >
          {isSameTierRenewal ? 'Renew' : isUpgrade ? 'Upgrade' : isDowngrade ? 'Downgrade' : 'Purchase'}
        </Button>
      </Row>
    </Col>
  )
}
