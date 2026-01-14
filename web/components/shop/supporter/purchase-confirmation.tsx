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

export function PurchaseConfirmation({
  tier,
  currentTier,
  daysRemaining,
  loading,
  onConfirm,
  onCancel,
}: {
  tier: SupporterTier
  currentTier: SupporterTier | null
  daysRemaining: number
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const tierConfig = SUPPORTER_TIERS[tier]
  const item = TIER_ITEMS[tier]
  const isUpgrade = currentTier && canUpgradeTo(currentTier, tier)
  const isSameTierRenewal = currentTier === tier

  // Calculate upgrade credit (matches backend logic)
  const upgradeCredit =
    isUpgrade && daysRemaining > 0
      ? Math.floor(daysRemaining * (TIER_ITEMS[currentTier!].price / 30))
      : 0
  const finalPrice = Math.max(0, item.price - upgradeCredit)

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
      ) : isUpgrade && upgradeCredit > 0 ? (
        /* Upgrade with credit */
        <>
          <p className="text-ink-600 mb-2">
            You're about to upgrade to{' '}
            <strong>{tierConfig.name} Supporter</strong>
          </p>
          <div className="mb-4 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
            <div className="space-y-1 text-sm">
              <Row className="justify-between text-green-800 dark:text-green-200">
                <span>{tierConfig.name} price:</span>
                <span className="text-ink-500 line-through">
                  {formatMoney(item.price)}
                </span>
              </Row>
              <Row className="justify-between text-green-800 dark:text-green-200">
                <span>
                  Credit ({daysRemaining}d of {SUPPORTER_TIERS[currentTier!].name}):
                </span>
                <span className="text-green-600 dark:text-green-400">
                  -{formatMoney(upgradeCredit)}
                </span>
              </Row>
              <Row className="justify-between border-t border-green-200 pt-1 font-bold text-green-800 dark:border-green-700 dark:text-green-200">
                <span>Final price:</span>
                <span className="text-amber-600">{formatMoney(finalPrice)}</span>
              </Row>
            </div>
          </div>
        </>
      ) : (
        /* Normal purchase */
        <p className="text-ink-600 mb-4">
          You're about to {isUpgrade ? 'upgrade to' : 'purchase'}{' '}
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
          {isSameTierRenewal ? 'Renew' : isUpgrade ? 'Upgrade' : 'Purchase'}
        </Button>
      </Row>
    </Col>
  )
}
